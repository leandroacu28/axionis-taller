import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePresupuestoDto } from './dto/create-presupuesto.dto';
import { UpdatePresupuestoDto } from './dto/update-presupuesto.dto';
import { CreatePresupuestoProductoDto } from './dto/create-presupuesto-producto.dto';
import { ListPresupuestosQueryDto } from './dto/list-presupuestos-query.dto';

// Module-level line select, reused everywhere a producto línea is returned
// (add/update responses + the nested embed in PRESUPUESTO_SELECT). Mirrors
// ORDEN_TRABAJO_PRODUCTO_SELECT (ordenes-trabajo.service.ts:53-60).
const PRESUPUESTO_PRODUCTO_SELECT = {
  id: true,
  cantidad: true,
  precioUnitario: true,
  precioTotal: true,
  producto: { select: { id: true, descripcion: true } },
  descripcionPersonalizada: true,
  updatedAt: true,
};

// Header projects creadoPor/actualizadoPor with the slim { id, username }
// shape — this module mirrors productos (PRODUCTO_SELECT), not the OT
// mecanico shape.
const PRESUPUESTO_SELECT = {
  id: true,
  fecha: true,
  telefono: true,
  descripcion: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  cliente: { select: { id: true, razonSocial: true } },
  tipoServicio: { select: { id: true, descripcion: true } },
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
  productos: { select: PRESUPUESTO_PRODUCTO_SELECT, orderBy: { id: 'asc' } },
} satisfies Prisma.PresupuestoSelect;

export type PresupuestoFilter = {
  search?: string;
  status?: ListPresupuestosQueryDto['status'];
  clienteId?: number;
  tipoServicioId?: number;
};

// Mirrors buildProductoWhere (productos.service.ts:53-72). Returns both
// `searchWhere` (status-independent, used for the activeCount) and `where`
// (combined filter for the paginated list). Search spans the quote's own
// text fields plus the related customer name.
//
// NOTE: MySQL's default collation here is case-insensitive (utf8mb4_*_ci),
// so `contains` already behaves case-insensitively without Prisma's
// `mode: 'insensitive'` — which MySQL's query engine doesn't support anyway.
function buildPresupuestoWhere(filter: PresupuestoFilter): {
  searchWhere: Prisma.PresupuestoWhereInput;
  where: Prisma.PresupuestoWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  const searchWhere: Prisma.PresupuestoWhereInput = term
    ? {
        OR: [
          { descripcion: { contains: term } },
          { telefono: { contains: term } },
          { cliente: { razonSocial: { contains: term } } },
        ],
      }
    : {};

  const where: Prisma.PresupuestoWhereInput = {
    ...searchWhere,
    ...(status === 'activo' ? { activo: true } : status === 'inactivo' ? { activo: false } : {}),
    ...(filter.clienteId != null ? { clienteId: filter.clienteId } : {}),
    ...(filter.tipoServicioId != null ? { tipoServicioId: filter.tipoServicioId } : {}),
  };

  return { searchWhere, where };
}

@Injectable()
export class PresupuestosService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertClienteActivo(
    client: Prisma.TransactionClient | PrismaService,
    clienteId: number
  ): Promise<void> {
    const cliente = await client.cliente.findUnique({
      where: { id: clienteId },
      select: { activo: true },
    });
    if (!cliente || !cliente.activo) {
      throw new BadRequestException('El cliente no existe o está inactivo.');
    }
  }

  private async assertTipoServicioActivo(
    client: Prisma.TransactionClient | PrismaService,
    tipoServicioId: number
  ): Promise<void> {
    const tipoServicio = await client.tipoServicio.findUnique({
      where: { id: tipoServicioId },
      select: { activo: true },
    });
    if (!tipoServicio || !tipoServicio.activo) {
      throw new BadRequestException('El tipo de servicio no existe o está inactivo.');
    }
  }

  // Byte-for-byte copy of ordenes-trabajo.service.ts:275-290 (design.md R1 /
  // Decision A3, non-negotiable): rejects inactive/missing producto AND
  // rejects a null precioVenta — a quote line can never freeze a price that
  // doesn't exist. Returns the live precioVenta so the caller can freeze it.
  private async assertProductoActivo(
    client: Prisma.TransactionClient | PrismaService,
    productoId: number
  ): Promise<{ precioVenta: Prisma.Decimal }> {
    const producto = await client.producto.findUnique({
      where: { id: productoId },
      select: { activo: true, precioVenta: true },
    });
    if (!producto || !producto.activo) {
      throw new BadRequestException('El producto no existe o está inactivo.');
    }
    if (producto.precioVenta == null) {
      throw new BadRequestException('El producto no tiene un precio de venta definido.');
    }
    return { precioVenta: producto.precioVenta };
  }

  // Replaces OT's loadDetalleParaProducto — there is no estado/lifecycle
  // gate here (D3: presupuestos have no lifecycle), so there is no
  // ConflictException branch, only existence.
  private async assertPresupuestoExists(
    client: Prisma.TransactionClient | PrismaService,
    presupuestoId: number
  ): Promise<void> {
    const presupuesto = await client.presupuesto.findUnique({
      where: { id: presupuestoId },
      select: { id: true },
    });
    if (!presupuesto) {
      throw new NotFoundException('Presupuesto no encontrado.');
    }
  }

  // Belongs-to check: the línea must belong to this presupuesto (so one
  // presupuesto's línea can't be edited via another presupuestoId in the
  // URL). Mirrors ordenes-trabajo.service.ts:257-270, retargeted from
  // detalleId to presupuestoId (this module has no intermediate detalle
  // join — design.md Decision A2).
  private async loadLinea(
    client: Prisma.TransactionClient | PrismaService,
    presupuestoId: number,
    detalleId: number
  ) {
    const linea = await client.presupuestoProducto.findUnique({
      where: { id: detalleId },
      select: { id: true, presupuestoId: true, cantidad: true, precioUnitario: true },
    });
    if (!linea || linea.presupuestoId !== presupuestoId) {
      throw new NotFoundException('Línea de producto no encontrada.');
    }
    return linea;
  }

  async findAll(query: ListPresupuestosQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildPresupuestoWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.presupuesto.findMany({
        where,
        select: PRESUPUESTO_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.presupuesto.count({ where }),
      // Active count ignores the status filter (but honors search) — mirrors
      // productos.service.ts's findAll.
      this.prisma.presupuesto.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async findOne(id: number) {
    const presupuesto = await this.prisma.presupuesto.findUnique({
      where: { id },
      select: PRESUPUESTO_SELECT,
    });
    if (!presupuesto) {
      throw new NotFoundException('Presupuesto no encontrado.');
    }
    return presupuesto;
  }

  async create(dto: CreatePresupuestoDto, creadoPorId: number) {
    await this.assertClienteActivo(this.prisma, dto.clienteId);
    await this.assertTipoServicioActivo(this.prisma, dto.tipoServicioId);

    return this.prisma.$transaction(async (tx) => {
      // NO `activo` in the data block — the Prisma schema `@default(true)`
      // is authoritative, mirroring ProductosService.create.
      const created = await tx.presupuesto.create({
        data: {
          fecha: new Date(dto.fecha),
          clienteId: dto.clienteId,
          tipoServicioId: dto.tipoServicioId,
          telefono: dto.telefono,
          descripcion: dto.descripcion,
          creadoPorId,
          actualizadoPorId: creadoPorId,
        },
        select: { id: true },
      });

      // Each initial line item runs the identical freeze/sum-on-duplicate
      // logic as addProducto — correctly handles the same productoId
      // appearing twice in the input array (second occurrence sums into the
      // first's freshly-created row).
      for (const item of dto.productos ?? []) {
        await this.addProductoLine(tx, created.id, item, creadoPorId);
      }

      const presupuesto = await tx.presupuesto.findUnique({
        where: { id: created.id },
        select: PRESUPUESTO_SELECT,
      });
      return presupuesto!;
    });
  }

  async update(id: number, dto: UpdatePresupuestoDto, actualizadoPorId: number) {
    await this.assertPresupuestoExists(this.prisma, id);
    // Re-validated unconditionally on every update — the full body always
    // carries both, same unconditional-recheck stance as productos.update
    // for unidadMedidaId.
    await this.assertClienteActivo(this.prisma, dto.clienteId);
    await this.assertTipoServicioActivo(this.prisma, dto.tipoServicioId);

    // Does NOT touch `productos` — line items are managed only via the
    // sub-routes below.
    return this.prisma.presupuesto.update({
      where: { id },
      data: {
        fecha: new Date(dto.fecha),
        clienteId: dto.clienteId,
        tipoServicioId: dto.tipoServicioId,
        telefono: dto.telefono,
        descripcion: dto.descripcion,
        activo: dto.activo,
        actualizadoPorId,
      },
      select: PRESUPUESTO_SELECT,
    });
  }

  // Shared freeze/sum-on-duplicate implementation used by both addProducto
  // (live sub-route) and create (initial productos[] items) — keeps the one
  // substantive business rule in exactly one place. Mirrors
  // addDetalleProducto (ordenes-trabajo.service.ts:702-751) exactly.
  private async addProductoLine(
    tx: Prisma.TransactionClient,
    presupuestoId: number,
    dto: CreatePresupuestoProductoDto,
    actualizadoPorId: number
  ) {
    const cantidad = new Prisma.Decimal(dto.cantidad);

    // Custom (non-catalog) item: no productoId to dedupe/merge by, so every
    // add is a brand-new line — skip the existing-lookup branch entirely.
    if (dto.productoId == null) {
      const descripcion = dto.descripcionPersonalizada?.trim();
      if (!descripcion) {
        throw new BadRequestException('La descripción del ítem personalizado es obligatoria.');
      }
      if (dto.precioUnitario == null) {
        throw new BadRequestException('El precio unitario es obligatorio para un ítem personalizado.');
      }
      const precioUnitario = new Prisma.Decimal(dto.precioUnitario);
      return tx.presupuestoProducto.create({
        data: {
          presupuestoId,
          productoId: null,
          descripcionPersonalizada: descripcion,
          cantidad,
          precioUnitario,
          precioTotal: precioUnitario.times(cantidad),
          actualizadoPorId,
        },
        select: PRESUPUESTO_PRODUCTO_SELECT,
      });
    }

    const { precioVenta } = await this.assertProductoActivo(tx, dto.productoId);

    const existing = await tx.presupuestoProducto.findUnique({
      where: {
        presupuestoId_productoId: {
          presupuestoId,
          productoId: dto.productoId,
        },
      },
      select: { id: true, cantidad: true, precioUnitario: true },
    });

    if (existing) {
      // Re-adding sums into the existing line and KEEPS the frozen
      // precioUnitario — the current catalog precioVenta is NOT re-read.
      const nuevaCantidad = existing.cantidad.plus(cantidad);
      return tx.presupuestoProducto.update({
        where: { id: existing.id },
        data: {
          cantidad: nuevaCantidad,
          precioTotal: existing.precioUnitario.times(nuevaCantidad),
          actualizadoPorId,
        },
        select: PRESUPUESTO_PRODUCTO_SELECT,
      });
    }

    // New line: freeze precioUnitario from the caller's override when given,
    // else the current catalog precioVenta. Either way this is a value
    // written only onto PresupuestoProducto — never back onto Producto.
    const precioUnitario =
      dto.precioUnitario != null ? new Prisma.Decimal(dto.precioUnitario) : precioVenta;
    return tx.presupuestoProducto.create({
      data: {
        presupuestoId,
        productoId: dto.productoId,
        cantidad,
        precioUnitario,
        precioTotal: precioUnitario.times(cantidad),
        actualizadoPorId,
      },
      select: PRESUPUESTO_PRODUCTO_SELECT,
    });
  }

  async addProducto(
    presupuestoId: number,
    dto: CreatePresupuestoProductoDto,
    actualizadoPorId: number
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPresupuestoExists(tx, presupuestoId);
      return this.addProductoLine(tx, presupuestoId, dto, actualizadoPorId);
    });
  }

  async updateProducto(
    presupuestoId: number,
    detalleId: number,
    dto: CreatePresupuestoProductoDto,
    actualizadoPorId: number
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPresupuestoExists(tx, presupuestoId);
      const linea = await this.loadLinea(tx, presupuestoId, detalleId);

      const cantidad = new Prisma.Decimal(dto.cantidad);
      // Recompute from the FROZEN precioUnitario when the caller doesn't
      // supply an override — catalog never re-read either way. Writes only
      // to PresupuestoProducto, never back onto Producto.precioVenta.
      const precioUnitario =
        dto.precioUnitario != null ? new Prisma.Decimal(dto.precioUnitario) : linea.precioUnitario;
      return tx.presupuestoProducto.update({
        where: { id: detalleId },
        data: {
          cantidad,
          precioUnitario,
          precioTotal: precioUnitario.times(cantidad),
          actualizadoPorId,
        },
        select: PRESUPUESTO_PRODUCTO_SELECT,
      });
    });
  }

  // No actualizadoPorId param — the row is deleted, there is nowhere to
  // stamp it. Mirrors removeDetalleProducto (ordenes-trabajo.service.ts:778-785).
  async removeProducto(presupuestoId: number, detalleId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPresupuestoExists(tx, presupuestoId);
      await this.loadLinea(tx, presupuestoId, detalleId);
      await tx.presupuestoProducto.delete({ where: { id: detalleId } });
    });
  }
}
