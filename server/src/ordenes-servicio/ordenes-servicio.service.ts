import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrdenServicioDto } from './dto/create-orden-servicio.dto';
import { UpdateOrdenServicioDto } from './dto/update-orden-servicio.dto';
import {
  ListOrdenesServicioQueryDto,
  EstadoFilter,
  OrdenServicioStatusFilter,
} from './dto/list-ordenes-servicio-query.dto';

const ORDEN_SERVICIO_SELECT = {
  id: true,
  numero: true,
  fechaIngreso: true,
  kilometros: true,
  prioridad: true,
  motivoIngreso: true,
  estado: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  cliente: { select: { id: true, razonSocial: true } },
  vehiculo: { select: { id: true, kilometraje: true, marca: { select: { marca: true, modelo: true } } } },
  mecanico: { select: { id: true, username: true, nombre: true, apellido: true } },
  tiposServicio: { select: { id: true, descripcion: true } },
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
};

const formatNumero = (id: number) => `OS-${String(id).padStart(4, '0')}`;

export type OrdenServicioFilter = {
  search?: string;
  estado?: EstadoFilter;
  status?: OrdenServicioStatusFilter;
};

// Mirrors etiquetas.service.ts's buildEtiquetaWhere. Returns both
// `searchWhere` (estado/activo-independent, used for the per-estado counts)
// and `where` (combined filter for the paginated list). `status` (activo) is
// additive on top of `estado` — an orthogonal soft-deactivation flag, not a
// replacement for the estado lifecycle filter.
function buildOrdenServicioWhere(filter: OrdenServicioFilter): {
  searchWhere: Prisma.OrdenServicioWhereInput;
  where: Prisma.OrdenServicioWhereInput;
} {
  const term = filter.search?.trim();
  const estado = filter.estado ?? 'all';
  const status = filter.status ?? 'all';

  const searchWhere: Prisma.OrdenServicioWhereInput = term
    ? {
        OR: [
          { numero: { contains: term } },
          { cliente: { razonSocial: { contains: term } } },
          { vehiculo: { marca: { marca: { contains: term } } } },
          { vehiculo: { marca: { modelo: { contains: term } } } },
        ],
      }
    : {};

  const where: Prisma.OrdenServicioWhereInput = {
    ...searchWhere,
    ...(estado !== 'all' ? { estado } : {}),
    ...(status === 'activo' ? { activo: true } : status === 'inactivo' ? { activo: false } : {}),
  };

  return { searchWhere, where };
}

@Injectable()
export class OrdenesServicioService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertVehiculoPerteneceACliente(
    client: Prisma.TransactionClient | PrismaService,
    vehiculoId: number,
    clienteId: number,
  ) {
    const vehiculo = await client.vehiculo.findUnique({ where: { id: vehiculoId } });
    if (!vehiculo) throw new BadRequestException('El vehículo no existe.');
    if (vehiculo.clienteId !== clienteId) {
      throw new BadRequestException('El vehículo no pertenece al cliente seleccionado.');
    }
  }

  // mirrors assertEtiquetasActivas + min-1
  private async assertTiposServicioActivos(client: Prisma.TransactionClient | PrismaService, ids: number[]) {
    if (ids.length === 0) throw new BadRequestException('Debe seleccionar al menos un tipo de servicio.');
    const tipos = await client.tipoServicio.findMany({ where: { id: { in: ids } } });
    if (tipos.length !== new Set(ids).size || tipos.some((t) => !t.activo)) {
      throw new BadRequestException('Uno o más tipos de servicio no existen o están inactivos.');
    }
  }

  // any active User (D6), not role-restricted
  private async assertMecanicoActivo(client: Prisma.TransactionClient | PrismaService, mecanicoId: number) {
    const mecanico = await client.user.findUnique({ where: { id: mecanicoId } });
    if (!mecanico || !mecanico.activo) throw new BadRequestException('El mecánico no existe o está inactivo.');
  }

  async findAll(query: ListOrdenesServicioQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildOrdenServicioWhere(query);

    const [data, total, pendienteCount, enProcesoCount, terminadoCount] = await this.prisma.$transaction([
      this.prisma.ordenServicio.findMany({
        where,
        select: ORDEN_SERVICIO_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ordenServicio.count({ where }),
      // Per-estado counts ignore the estado filter (but honor search) —
      // reframes the catalog activeCount pattern per D2.
      this.prisma.ordenServicio.count({ where: { ...searchWhere, estado: 'pendiente' } }),
      this.prisma.ordenServicio.count({ where: { ...searchWhere, estado: 'en_proceso' } }),
      this.prisma.ordenServicio.count({ where: { ...searchWhere, estado: 'terminado' } }),
    ]);

    return {
      data,
      total,
      counts: { pendiente: pendienteCount, en_proceso: enProcesoCount, terminado: terminadoCount },
    };
  }

  async findOne(id: number) {
    const orden = await this.prisma.ordenServicio.findUnique({ where: { id }, select: ORDEN_SERVICIO_SELECT });
    if (!orden) {
      throw new NotFoundException('Orden de servicio no encontrada.');
    }
    return orden;
  }

  async create(dto: CreateOrdenServicioDto, creadoPorId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Guards run inside the transaction (with `tx`) so the referenced
      // vehiculo/tiposServicio/mecanico can't be deactivated between the
      // check and the write (closes the TOCTOU window).
      await this.assertVehiculoPerteneceACliente(tx, dto.vehiculoId, dto.clienteId);
      await this.assertTiposServicioActivos(tx, dto.tipoServicioIds);
      await this.assertMecanicoActivo(tx, dto.mecanicoId);

      const created = await tx.ordenServicio.create({
        data: {
          fechaIngreso: dto.fechaIngreso ? new Date(dto.fechaIngreso) : undefined, // undefined → @default(now())
          kilometros: dto.kilometros,
          prioridad: dto.prioridad,
          motivoIngreso: dto.motivoIngreso,
          estado: dto.estado,
          clienteId: dto.clienteId,
          vehiculoId: dto.vehiculoId,
          mecanicoId: dto.mecanicoId,
          creadoPorId,
          actualizadoPorId: creadoPorId,
          tiposServicio: { connect: dto.tipoServicioIds.map((id) => ({ id })) },
        },
        select: { id: true },
      });
      const orden = await tx.ordenServicio.update({
        where: { id: created.id },
        data: { numero: formatNumero(created.id) },
        select: ORDEN_SERVICIO_SELECT,
      });
      // Saving an order overwrites the vehicle's current odometer reading —
      // deliberate, user-confirmed product decision (proposal D5), lossy
      // (no history kept) but intentional.
      await tx.vehiculo.update({ where: { id: dto.vehiculoId }, data: { kilometraje: dto.kilometros } });
      return orden;
    });
  }

  async update(id: number, dto: UpdateOrdenServicioDto, actualizadoPorId: number) {
    const existing = await this.prisma.ordenServicio.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Orden de servicio no encontrada.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Guards run inside the transaction — see comment in create() above.
      await this.assertVehiculoPerteneceACliente(tx, dto.vehiculoId, dto.clienteId);
      await this.assertTiposServicioActivos(tx, dto.tipoServicioIds);
      await this.assertMecanicoActivo(tx, dto.mecanicoId);

      // numero is never regenerated on update — immutable once set.
      const orden = await tx.ordenServicio.update({
        where: { id },
        data: {
          fechaIngreso: dto.fechaIngreso ? new Date(dto.fechaIngreso) : undefined,
          kilometros: dto.kilometros,
          prioridad: dto.prioridad,
          motivoIngreso: dto.motivoIngreso,
          estado: dto.estado,
          activo: dto.activo,
          clienteId: dto.clienteId,
          vehiculoId: dto.vehiculoId,
          mecanicoId: dto.mecanicoId,
          actualizadoPorId,
          tiposServicio: { set: dto.tipoServicioIds.map((tipoServicioId) => ({ id: tipoServicioId })) },
        },
        select: ORDEN_SERVICIO_SELECT,
      });
      // Odometer overwrite — see comment in create() above (D5).
      await tx.vehiculo.update({ where: { id: dto.vehiculoId }, data: { kilometraje: dto.kilometros } });
      return orden;
    });
  }
}
