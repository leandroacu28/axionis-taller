import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrdenTrabajoDto } from './dto/create-orden-trabajo.dto';
import { UpdateOrdenTrabajoDto } from './dto/update-orden-trabajo.dto';
import { UpdateOrdenTrabajoDetalleDto } from './dto/update-orden-trabajo-detalle.dto';
import {
  ListOrdenesTrabajoQueryDto,
  EstadoFilter,
  OrdenTrabajoStatusFilter,
  PrioridadFilter,
} from './dto/list-ordenes-trabajo-query.dto';

const ORDEN_TRABAJO_SELECT = {
  id: true,
  numero: true,
  fechaIngreso: true,
  kilometros: true,
  prioridad: true,
  motivoIngreso: true,
  estado: true,
  fechaFinalizacion: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  cliente: { select: { id: true, razonSocial: true } },
  vehiculo: {
    select: { id: true, kilometraje: true, marca: { select: { marca: true, modelo: true } } },
  },
  mecanico: { select: { id: true, username: true, nombre: true, apellido: true } },
  detalles: { select: { tipoServicio: { select: { id: true, descripcion: true } } } },
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
};

const formatNumero = (id: number) => `OT-${String(id).padStart(4, '0')}`;

// ORDEN_TRABAJO_SELECT reads the new explicit `detalles` join instead of the
// old implicit `tiposServicio` M2M, but the public API contract must not
// change — every caller still gets `tiposServicio: [{id, descripcion}]` and
// never sees the raw `detalles` key. Applied to every query result that uses
// ORDEN_TRABAJO_SELECT (findAll's data, findOne, create, update).
function mapOrdenTrabajo<T extends { detalles: { tipoServicio: { id: number; descripcion: string } }[] }>(
  orden: T
): Omit<T, 'detalles'> & { tiposServicio: { id: number; descripcion: string }[] } {
  const { detalles, ...rest } = orden;
  return { ...rest, tiposServicio: detalles.map((d) => d.tipoServicio) };
}

export type OrdenTrabajoFilter = {
  search?: string;
  estado?: EstadoFilter;
  status?: OrdenTrabajoStatusFilter;
  mecanicoId?: number;
  prioridad?: PrioridadFilter;
};

// Mirrors etiquetas.service.ts's buildEtiquetaWhere. Returns both
// `searchWhere` (estado/activo-independent, used for the per-estado counts)
// and `where` (combined filter for the paginated list). `status` (activo),
// `mecanicoId`, and `prioridad` are all additive on top of `estado` —
// orthogonal filters, not a replacement for the estado lifecycle filter, and
// (like `status`) excluded from the per-estado counts.
function buildOrdenTrabajoWhere(filter: OrdenTrabajoFilter): {
  searchWhere: Prisma.OrdenTrabajoWhereInput;
  where: Prisma.OrdenTrabajoWhereInput;
} {
  const term = filter.search?.trim();
  const estado = filter.estado ?? 'all';
  const status = filter.status ?? 'all';
  const prioridad = filter.prioridad ?? 'all';

  const searchWhere: Prisma.OrdenTrabajoWhereInput = term
    ? {
        OR: [
          { numero: { contains: term } },
          { cliente: { razonSocial: { contains: term } } },
          { vehiculo: { marca: { marca: { contains: term } } } },
          { vehiculo: { marca: { modelo: { contains: term } } } },
        ],
      }
    : {};

  const where: Prisma.OrdenTrabajoWhereInput = {
    ...searchWhere,
    ...(estado !== 'all' ? { estado } : {}),
    ...(status === 'activo' ? { activo: true } : status === 'inactivo' ? { activo: false } : {}),
    ...(filter.mecanicoId ? { mecanicoId: filter.mecanicoId } : {}),
    ...(prioridad !== 'all' ? { prioridad } : {}),
  };

  return { searchWhere, where };
}

@Injectable()
export class OrdenesTrabajoService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertVehiculoPerteneceACliente(
    client: Prisma.TransactionClient | PrismaService,
    vehiculoId: number,
    clienteId: number
  ) {
    const vehiculo = await client.vehiculo.findUnique({ where: { id: vehiculoId } });
    if (!vehiculo) throw new BadRequestException('El vehículo no existe.');
    if (vehiculo.clienteId !== clienteId) {
      throw new BadRequestException('El vehículo no pertenece al cliente seleccionado.');
    }
  }

  // mirrors assertEtiquetasActivas + min-1
  private async assertTiposServicioActivos(
    client: Prisma.TransactionClient | PrismaService,
    ids: number[]
  ) {
    if (ids.length === 0)
      throw new BadRequestException('Debe seleccionar al menos un tipo de servicio.');
    const tipos = await client.tipoServicio.findMany({ where: { id: { in: ids } } });
    if (tipos.length !== new Set(ids).size || tipos.some((t) => !t.activo)) {
      throw new BadRequestException('Uno o más tipos de servicio no existen o están inactivos.');
    }
  }

  // any active User (D6), not role-restricted
  private async assertMecanicoActivo(
    client: Prisma.TransactionClient | PrismaService,
    mecanicoId: number
  ) {
    const mecanico = await client.user.findUnique({ where: { id: mecanicoId } });
    if (!mecanico || !mecanico.activo)
      throw new BadRequestException('El mecánico no existe o está inactivo.');
  }

  async findAll(query: ListOrdenesTrabajoQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildOrdenTrabajoWhere(query);

    const [data, total, pendienteCount, enProcesoCount, terminadoCount, canceladoCount] =
      await this.prisma.$transaction([
        this.prisma.ordenTrabajo.findMany({
          where,
          select: ORDEN_TRABAJO_SELECT,
          orderBy: { id: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.ordenTrabajo.count({ where }),
        // Per-estado counts ignore the estado filter (but honor search) —
        // reframes the catalog activeCount pattern per D2.
        this.prisma.ordenTrabajo.count({ where: { ...searchWhere, estado: 'pendiente' } }),
        this.prisma.ordenTrabajo.count({ where: { ...searchWhere, estado: 'en_proceso' } }),
        this.prisma.ordenTrabajo.count({ where: { ...searchWhere, estado: 'terminado' } }),
        this.prisma.ordenTrabajo.count({ where: { ...searchWhere, estado: 'cancelado' } }),
      ]);

    return {
      data: data.map(mapOrdenTrabajo),
      total,
      counts: {
        pendiente: pendienteCount,
        en_proceso: enProcesoCount,
        terminado: terminadoCount,
        cancelado: canceladoCount,
      },
    };
  }

  async findOne(id: number) {
    const orden = await this.prisma.ordenTrabajo.findUnique({
      where: { id },
      select: ORDEN_TRABAJO_SELECT,
    });
    if (!orden) {
      throw new NotFoundException('Orden de trabajo no encontrada.');
    }
    return mapOrdenTrabajo(orden);
  }

  async create(dto: CreateOrdenTrabajoDto, creadoPorId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Guards run inside the transaction (with `tx`) so the referenced
      // vehiculo/tiposServicio/mecanico can't be deactivated between the
      // check and the write (closes the TOCTOU window).
      await this.assertVehiculoPerteneceACliente(tx, dto.vehiculoId, dto.clienteId);
      await this.assertTiposServicioActivos(tx, dto.tipoServicioIds);
      await this.assertMecanicoActivo(tx, dto.mecanicoId);

      const created = await tx.ordenTrabajo.create({
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
          detalles: { create: dto.tipoServicioIds.map((tipoServicioId) => ({ tipoServicioId })) },
        },
        select: { id: true },
      });
      const orden = await tx.ordenTrabajo.update({
        where: { id: created.id },
        data: { numero: formatNumero(created.id) },
        select: ORDEN_TRABAJO_SELECT,
      });
      // Saving an order overwrites the vehicle's current odometer reading —
      // deliberate, user-confirmed product decision (proposal D5), lossy
      // (no history kept) but intentional.
      await tx.vehiculo.update({
        where: { id: dto.vehiculoId },
        data: { kilometraje: dto.kilometros },
      });
      return mapOrdenTrabajo(orden);
    });
  }

  async update(id: number, dto: UpdateOrdenTrabajoDto, actualizadoPorId: number) {
    const existing = await this.prisma.ordenTrabajo.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Orden de trabajo no encontrada.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Guards run inside the transaction — see comment in create() above.
      await this.assertVehiculoPerteneceACliente(tx, dto.vehiculoId, dto.clienteId);
      await this.assertTiposServicioActivos(tx, dto.tipoServicioIds);
      await this.assertMecanicoActivo(tx, dto.mecanicoId);

      // Unlike the old implicit M2M's `set` (which silently wiped and
      // re-created associations with no side data, so it was safe), the
      // explicit `detalles` rows now carry progress (estado/diagnóstico/
      // trabajo realizado/etc.) that must survive for tipos that remain
      // selected. Reconcile with a targeted add/remove diff instead of a
      // blanket replace.
      const currentDetalles = await tx.ordenTrabajoTipoServicio.findMany({
        where: { ordenTrabajoId: id },
        select: { tipoServicioId: true },
      });
      const currentIds = new Set(currentDetalles.map((d) => d.tipoServicioId));
      const nextIds = new Set(dto.tipoServicioIds);
      const toAdd = dto.tipoServicioIds.filter((tipoServicioId) => !currentIds.has(tipoServicioId));
      const toRemove = [...currentIds].filter((tipoServicioId) => !nextIds.has(tipoServicioId));

      if (toAdd.length > 0) {
        await tx.ordenTrabajoTipoServicio.createMany({
          data: toAdd.map((tipoServicioId) => ({ ordenTrabajoId: id, tipoServicioId })),
        });
      }
      if (toRemove.length > 0) {
        await tx.ordenTrabajoTipoServicio.deleteMany({
          where: { ordenTrabajoId: id, tipoServicioId: { in: toRemove } },
        });
      }

      // numero is never regenerated on update — immutable once set.
      const orden = await tx.ordenTrabajo.update({
        where: { id },
        data: {
          fechaIngreso: dto.fechaIngreso ? new Date(dto.fechaIngreso) : undefined,
          kilometros: dto.kilometros,
          prioridad: dto.prioridad,
          motivoIngreso: dto.motivoIngreso,
          estado: dto.estado,
          fechaFinalizacion: dto.fechaFinalizacion ? new Date(dto.fechaFinalizacion) : undefined,
          activo: dto.activo,
          clienteId: dto.clienteId,
          vehiculoId: dto.vehiculoId,
          mecanicoId: dto.mecanicoId,
          actualizadoPorId,
        },
        select: ORDEN_TRABAJO_SELECT,
      });
      // Odometer overwrite — see comment in create() above (D5).
      await tx.vehiculo.update({
        where: { id: dto.vehiculoId },
        data: { kilometraje: dto.kilometros },
      });
      return mapOrdenTrabajo(orden);
    });
  }

  // Dedicated business action for starting an order — mirrors create/update's
  // $transaction style. Unlike the generic PATCH, this cascades a
  // still-pendiente order and its still-pendiente detalles to en_proceso in
  // one atomic step (see proposal/design.md).
  async iniciar(id: number, actualizadoPorId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Snapshot read ONLY to distinguish 404 (absent) from 409 (present, wrong state).
      const existing = await tx.ordenTrabajo.findUnique({
        where: { id },
        select: { estado: true },
      });
      if (!existing) throw new NotFoundException('Orden de trabajo no encontrada.');

      // Race-free guard: the scoped UPDATE is a locking current-read. Two concurrent
      // iniciar calls cannot both flip 'pendiente' -> 'en_proceso'; the loser matches
      // zero rows and gets the mandated 409. A plain update({ where: { id } }) would
      // silently re-stamp actualizadoPorId and swallow the 409 (see D1 Concurrency note).
      const { count } = await tx.ordenTrabajo.updateMany({
        where: { id, estado: 'pendiente' },
        data: { estado: 'en_proceso', actualizadoPorId },
      });
      if (count === 0) {
        // existing was confirmed present above, so count === 0 means another
        // transaction already moved it out of 'pendiente'.
        throw new ConflictException('La orden ya fue iniciada o no está pendiente.');
      }

      // Cascade only still-pending lines (D6); lines advanced ahead are left as-is.
      await tx.ordenTrabajoTipoServicio.updateMany({
        where: { ordenTrabajoId: id, estado: 'pendiente' },
        data: { estado: 'en_proceso', actualizadoPorId },
      });

      // Non-null assertion: the row is guaranteed to exist here — the
      // conditional updateMany above only reaches count > 0 when `id` matched
      // an existing row, so this re-fetch cannot return null.
      const orden = await tx.ordenTrabajo.findUnique({
        where: { id },
        select: ORDEN_TRABAJO_SELECT,
      });
      return mapOrdenTrabajo(orden!); // D9: order shape only
    });
  }

  async findDetalles(ordenTrabajoId: number) {
    const orden = await this.prisma.ordenTrabajo.findUnique({ where: { id: ordenTrabajoId } });
    if (!orden) {
      throw new NotFoundException('Orden de trabajo no encontrada.');
    }
    return this.prisma.ordenTrabajoTipoServicio.findMany({
      where: { ordenTrabajoId },
      select: {
        id: true,
        estado: true,
        trabajoRealizado: true,
        proximoServiceFecha: true,
        proximoServiceKm: true,
        fechaFinalizacion: true,
        tipoServicio: { select: { id: true, descripcion: true } },
        diagnostico: { select: { id: true, descripcion: true } },
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async updateDetalle(
    ordenTrabajoId: number,
    detalleId: number,
    dto: UpdateOrdenTrabajoDetalleDto,
    actualizadoPorId: number
  ) {
    const existing = await this.prisma.ordenTrabajoTipoServicio.findUnique({
      where: { id: detalleId },
    });
    // Belongs-to check matters so one order's detalle can't be edited via
    // another order's id in the URL.
    if (!existing || existing.ordenTrabajoId !== ordenTrabajoId) {
      throw new NotFoundException('Detalle de orden de trabajo no encontrado.');
    }

    if (dto.diagnosticoId != null) {
      // Existence check only — doesn't need to be `activo`, an already-set
      // diagnosis shouldn't become uneditable just because the catalog
      // entry was later deactivated.
      const diagnostico = await this.prisma.diagnostico.findUnique({
        where: { id: dto.diagnosticoId },
      });
      if (!diagnostico) {
        throw new NotFoundException('Diagnóstico no encontrado.');
      }
    }

    return this.prisma.ordenTrabajoTipoServicio.update({
      where: { id: detalleId },
      data: {
        estado: dto.estado,
        diagnosticoId: dto.diagnosticoId,
        trabajoRealizado: dto.trabajoRealizado,
        proximoServiceFecha: dto.proximoServiceFecha
          ? new Date(dto.proximoServiceFecha)
          : dto.proximoServiceFecha,
        proximoServiceKm: dto.proximoServiceKm,
        fechaFinalizacion: dto.fechaFinalizacion
          ? new Date(dto.fechaFinalizacion)
          : dto.fechaFinalizacion,
        actualizadoPorId,
      },
      select: {
        id: true,
        estado: true,
        trabajoRealizado: true,
        proximoServiceFecha: true,
        proximoServiceKm: true,
        fechaFinalizacion: true,
        tipoServicio: { select: { id: true, descripcion: true } },
        diagnostico: { select: { id: true, descripcion: true } },
        updatedAt: true,
      },
    });
  }
}
