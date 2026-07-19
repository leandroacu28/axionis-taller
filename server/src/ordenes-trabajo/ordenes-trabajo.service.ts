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
import { CreateOrdenTrabajoProductoDto } from './dto/create-orden-trabajo-producto.dto';
import { UpdateOrdenTrabajoProductoDto } from './dto/update-orden-trabajo-producto.dto';
import {
  ListOrdenesTrabajoQueryDto,
  EstadoFilter,
  OrdenTrabajoStatusFilter,
  PrioridadFilter,
} from './dto/list-ordenes-trabajo-query.dto';
import { PanelOrdenesTrabajoQueryDto } from './dto/panel-ordenes-trabajo-query.dto';

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
    select: {
      id: true,
      kilometraje: true,
      patente: true,
      marca: { select: { marca: true, modelo: true } },
    },
  },
  mecanico: { select: { id: true, username: true, nombre: true, apellido: true } },
  detalles: { select: { tipoServicio: { select: { id: true, descripcion: true } } } },
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
};

const formatNumero = (id: number) => `OT-${String(id).padStart(4, '0')}`;

// Module-level line select, reused everywhere a producto línea is returned
// (add/update responses + both embeds in findDetalles/updateDetalle).
const ORDEN_TRABAJO_PRODUCTO_SELECT = {
  id: true,
  cantidad: true,
  precioUnitario: true,
  precioTotal: true,
  producto: { select: { id: true, descripcion: true } },
  updatedAt: true,
};

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
// `searchWhere` (estado/activo-independent, used as the base for the
// per-estado counts) and `where` (combined filter for the paginated list).
// `status` (activo), `mecanicoId`, and `prioridad` are all additive on top of
// `estado` — orthogonal filters, not a replacement for the estado lifecycle
// filter, and (like `mecanicoId`/`prioridad`) ignored by the per-estado
// counts regardless of the chosen `status` — those always force `activo:
// true` (see countsWhere in findAll) so deactivated orders never inflate them.
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

// Hard cap on the Panel's unpaginated board (resolves D5). A workshop's live
// (activo: true) order set within any sane window — even "mes" — is
// realistically dozens to low hundreds. 500 gives generous headroom while
// bounding worst-case payload (~500 × ~1 KB card JSON ≈ 0.5 MB) and DOM cost
// (4 columns × up to 500 cards). Crossing 500 signals a filter that is too
// broad rather than a real operational need; the "showing first N" banner
// tells the operator to narrow the window. A single constant, trivially
// tunable later.
const PANEL_ORDENES_CAP = 500;

// Converts a yyyy-mm-dd window to a UTC half-open interval [gte, lt) on
// fechaIngreso. fechaIngreso is stored via `new Date('yyyy-mm-dd')`, which is
// midnight UTC of the picked calendar date — so boundaries MUST be built in
// UTC (never local server time, never setDate/getDate) to line up exactly
// with how the rows were stored, regardless of the server's timezone.
function dateRange(desde: string, hasta: string): { gte: Date; lt: Date } {
  const gte = new Date(`${desde}T00:00:00.000Z`); // inclusive lower bound, UTC midnight
  const lt = new Date(`${hasta}T00:00:00.000Z`);
  lt.setUTCDate(lt.getUTCDate() + 1); // exclusive upper bound = (hasta + 1 day) UTC midnight
  return { gte, lt };
}

// Panel-local where builder (ADR-1: NOT a reuse/extension of
// buildOrdenTrabajoWhere above). The Panel where has different invariants —
// it always forces activo: true (board = live work only, D4 convention), adds
// a fechaIngreso range, and carries no search/status. Overloading the shared
// list builder with these would couple two endpoints with divergent
// invariants for zero benefit.
function buildPanelOrdenTrabajoWhere(
  query: PanelOrdenesTrabajoQueryDto
): Prisma.OrdenTrabajoWhereInput {
  const estado = query.estado ?? 'all';
  const prioridad = query.prioridad ?? 'all';

  return {
    activo: true,
    ...(estado !== 'all' ? { estado } : {}),
    ...(prioridad !== 'all' ? { prioridad } : {}),
    ...(query.mecanicoId ? { mecanicoId: query.mecanicoId } : {}),
    ...(query.fechaDesde && query.fechaHasta
      ? { fechaIngreso: dateRange(query.fechaDesde, query.fechaHasta) }
      : {}),
  };
}

// Response shape for panel() (design.md §1.3). `data`'s element type is left
// to inference (like findAll()'s own `data.map(mapOrdenTrabajo)` — no
// parallel OrdenTrabajoListItem type exists on the backend) rather than
// re-declared here. No `cancelado` figure in `stats` — the five figures are
// fixed by the proposal (del día, pendiente, en proceso, terminado, mecánicos
// trabajando); the `cancelado` board column is populated purely client-side
// from `data`.
type PanelStats = {
  delDia: number;
  pendiente: number;
  enProceso: number;
  terminado: number;
  mecanicosTrabajando: number;
};

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

  // NOVEL server-side terminado guard + belongs-to check. No existing method
  // guards estado === 'terminado' server-side (updateDetalle does not), so
  // this is the enforcement point for D3 on the new producto endpoints.
  private async loadDetalleParaProducto(
    client: Prisma.TransactionClient | PrismaService,
    ordenTrabajoId: number,
    detalleId: number
  ) {
    const detalle = await client.ordenTrabajoTipoServicio.findUnique({
      where: { id: detalleId },
      select: { id: true, ordenTrabajoId: true, estado: true },
    });
    if (!detalle || detalle.ordenTrabajoId !== ordenTrabajoId) {
      throw new NotFoundException('Detalle de orden de trabajo no encontrado.');
    }
    if (detalle.estado === 'terminado') {
      throw new ConflictException('No se pueden modificar los productos de un servicio terminado.');
    }
    return detalle;
  }

  // Belongs-to check: the línea must belong to this detalle (so one detalle's
  // línea can't be edited via another detalleId in the URL). Returns the
  // frozen precioUnitario + cantidad needed by the update/sum recompute.
  private async loadLinea(
    client: Prisma.TransactionClient | PrismaService,
    detalleId: number,
    lineaId: number
  ) {
    const linea = await client.ordenTrabajoTipoServicioProducto.findUnique({
      where: { id: lineaId },
      select: { id: true, ordenTrabajoTipoServicioId: true, cantidad: true, precioUnitario: true },
    });
    if (!linea || linea.ordenTrabajoTipoServicioId !== detalleId) {
      throw new NotFoundException('Línea de producto no encontrada.');
    }
    return linea;
  }

  // Mirrors assertUnidadMedidaActiva / assertTiposServicioActivos. Also
  // returns the live precioVenta so the caller can freeze it into
  // precioUnitario, and guards the nullable precioVenta (schema: Decimal?).
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

  async findAll(query: ListOrdenesTrabajoQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildOrdenTrabajoWhere(query);

    // Per-estado counts always exclude inactive (soft-deactivated) orders,
    // regardless of the `status` filter — they're a summary of live work,
    // not a mirror of the current activo filter.
    const countsWhere: Prisma.OrdenTrabajoWhereInput = { ...searchWhere, activo: true };

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
        this.prisma.ordenTrabajo.count({ where: { ...countsWhere, estado: 'pendiente' } }),
        this.prisma.ordenTrabajo.count({ where: { ...countsWhere, estado: 'en_proceso' } }),
        this.prisma.ordenTrabajo.count({ where: { ...countsWhere, estado: 'terminado' } }),
        this.prisma.ordenTrabajo.count({ where: { ...countsWhere, estado: 'cancelado' } }),
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

  // Aggregated read endpoint for the Panel de Trabajo (Kanban) view. Returns
  // stats + mecanicosTrabajando + the (capped) filtered order set in one
  // $transaction so they can never disagree (D3) — see design.md §1.5/§1.6.
  async panel(query: PanelOrdenesTrabajoQueryDto) {
    // Cross-field date validation (mirrors how the service already raises
    // BadRequestException for business rules rather than a custom
    // class-validator): both-or-neither, and fechaDesde <= fechaHasta.
    const hasDesde = query.fechaDesde != null;
    const hasHasta = query.fechaHasta != null;
    if (hasDesde !== hasHasta) {
      throw new BadRequestException(
        'Debe indicar tanto fechaDesde como fechaHasta, o ninguno de los dos.'
      );
    }
    if (hasDesde && hasHasta && query.fechaDesde! > query.fechaHasta!) {
      throw new BadRequestException('fechaDesde no puede ser posterior a fechaHasta.');
    }

    const where = buildPanelOrdenTrabajoWhere(query);
    // No `hoy` → delDia is cheaply 0 via an impossible predicate, rather than
    // a conditional branch inside the $transaction array.
    const delDiaWhere: Prisma.OrdenTrabajoWhereInput = query.hoy
      ? { AND: [where, { fechaIngreso: dateRange(query.hoy, query.hoy) }] }
      : { id: -1 };

    const [rows, total, delDiaCount, pendienteCount, enProcesoCount, terminadoCount, mecanicos] =
      await this.prisma.$transaction([
        this.prisma.ordenTrabajo.findMany({
          where,
          select: ORDEN_TRABAJO_SELECT,
          orderBy: [{ prioridad: 'desc' }, { fechaIngreso: 'desc' }, { id: 'desc' }],
          take: PANEL_ORDENES_CAP,
        }),
        this.prisma.ordenTrabajo.count({ where }),
        this.prisma.ordenTrabajo.count({ where: delDiaWhere }),
        // AND-composition (not spread) — see buildPanelOrdenTrabajoWhere/
        // design.md §1.5: a user's own estado filter must not be overridable
        // by these sub-counts (D3).
        this.prisma.ordenTrabajo.count({ where: { AND: [where, { estado: 'pendiente' }] } }),
        this.prisma.ordenTrabajo.count({ where: { AND: [where, { estado: 'en_proceso' }] } }),
        this.prisma.ordenTrabajo.count({ where: { AND: [where, { estado: 'terminado' }] } }),
        this.prisma.ordenTrabajo.groupBy({
          by: ['mecanicoId'],
          where: { AND: [where, { estado: 'en_proceso' }] },
          orderBy: { mecanicoId: 'asc' },
        }),
      ]);

    return {
      stats: {
        delDia: delDiaCount,
        pendiente: pendienteCount,
        enProceso: enProcesoCount,
        terminado: terminadoCount,
        mecanicosTrabajando: mecanicos.length,
      },
      data: rows.map(mapOrdenTrabajo),
      meta: { total, cap: PANEL_ORDENES_CAP, capped: total > PANEL_ORDENES_CAP },
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
        productos: { select: ORDEN_TRABAJO_PRODUCTO_SELECT, orderBy: { id: 'asc' } },
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
        productos: { select: ORDEN_TRABAJO_PRODUCTO_SELECT, orderBy: { id: 'asc' } },
        updatedAt: true,
      },
    });
  }

  async addDetalleProducto(
    ordenTrabajoId: number,
    detalleId: number,
    dto: CreateOrdenTrabajoProductoDto,
    actualizadoPorId: number
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.loadDetalleParaProducto(tx, ordenTrabajoId, detalleId);
      const { precioVenta } = await this.assertProductoActivo(tx, dto.productoId);

      const cantidad = new Prisma.Decimal(dto.cantidad);
      const existing = await tx.ordenTrabajoTipoServicioProducto.findUnique({
        where: {
          ordenTrabajoTipoServicioId_productoId: {
            ordenTrabajoTipoServicioId: detalleId,
            productoId: dto.productoId,
          },
        },
        select: { id: true, cantidad: true, precioUnitario: true },
      });

      if (existing) {
        // D4: re-adding sums into the existing line and KEEPS the frozen
        // precioUnitario (D1) — the current catalog precioVenta is NOT re-read.
        const nuevaCantidad = existing.cantidad.plus(cantidad);
        return tx.ordenTrabajoTipoServicioProducto.update({
          where: { id: existing.id },
          data: {
            cantidad: nuevaCantidad,
            precioTotal: existing.precioUnitario.times(nuevaCantidad),
            actualizadoPorId,
          },
          select: ORDEN_TRABAJO_PRODUCTO_SELECT,
        });
      }

      // New line: freeze precioUnitario from the current catalog precioVenta.
      return tx.ordenTrabajoTipoServicioProducto.create({
        data: {
          ordenTrabajoTipoServicioId: detalleId,
          productoId: dto.productoId,
          cantidad,
          precioUnitario: precioVenta,
          precioTotal: precioVenta.times(cantidad),
          actualizadoPorId,
        },
        select: ORDEN_TRABAJO_PRODUCTO_SELECT,
      });
    });
  }

  async updateDetalleProducto(
    ordenTrabajoId: number,
    detalleId: number,
    lineaId: number,
    dto: UpdateOrdenTrabajoProductoDto,
    actualizadoPorId: number
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.loadDetalleParaProducto(tx, ordenTrabajoId, detalleId);
      const linea = await this.loadLinea(tx, detalleId, lineaId);

      const cantidad = new Prisma.Decimal(dto.cantidad);
      return tx.ordenTrabajoTipoServicioProducto.update({
        where: { id: lineaId },
        data: {
          cantidad,
          // Recompute from the FROZEN precioUnitario (D1) — catalog never re-read.
          precioTotal: linea.precioUnitario.times(cantidad),
          actualizadoPorId,
        },
        select: ORDEN_TRABAJO_PRODUCTO_SELECT,
      });
    });
  }

  // No actualizadoPorId param — the row is deleted, there is nowhere to stamp it.
  async removeDetalleProducto(ordenTrabajoId: number, detalleId: number, lineaId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.loadDetalleParaProducto(tx, ordenTrabajoId, detalleId);
      await this.loadLinea(tx, detalleId, lineaId);
      await tx.ordenTrabajoTipoServicioProducto.delete({ where: { id: lineaId } });
    });
  }
}
