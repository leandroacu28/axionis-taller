import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { ListProductosQueryDto, ProductoStatusFilter } from './dto/list-productos-query.dto';

const PRODUCTO_SELECT = {
  id: true,
  descripcion: true,
  codigo: true,
  activo: true,
  cantidadInicial: true,
  alertaStock: true,
  cantidadMinima: true,
  precioCompra: true,
  porcentajeGanancia: true,
  precioVenta: true,
  precioMayorista: true,
  alicuotaIva: true,
  unidadMedidaId: true,
  unidadMedida: { select: { id: true, descripcion: true } },
  etiquetas: { select: { id: true, descripcion: true } },
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
};

const DUPLICATE_DESCRIPCION_ERROR = 'Ya existe un producto con esa descripción.';
const UNIDAD_MEDIDA_INVALID_ERROR = 'La unidad de medida no existe o está inactiva.';
const ETIQUETAS_INVALID_ERROR = 'Una o más etiquetas no existen o están inactivas.';

export type ProductoFilter = { search?: string; status?: ProductoStatusFilter };

// Number <-> Prisma enum codec. `10.5` is not a legal Prisma enum
// identifier, so the DB/enum member names are IVA_21/IVA_10_5/IVA_EXENTO
// (mapped to the raw '21'/'10.5'/'exento' values via @map) while the API
// contract stays a plain number — the client never learns the enum member
// names. "Exento" (tax-exempt) has no percentage, so it's represented as 0
// on the API/number side.
const IVA_TO_ENUM = { 21: 'IVA_21', 10.5: 'IVA_10_5', 0: 'IVA_EXENTO' } as const;
const ENUM_TO_IVA: Record<string, number> = { IVA_21: 21, IVA_10_5: 10.5, IVA_EXENTO: 0 };

// Mirrors service-types.service.ts / unidades-medida.service.ts's
// buildXWhere pattern. Returns both `searchWhere` (status-independent, used
// for the activeCount) and `where` (combined filter for the paginated list).
function buildProductoWhere(filter: ProductoFilter): {
  searchWhere: Prisma.ProductoWhereInput;
  where: Prisma.ProductoWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  // `codigo` is manually entered and not unique, but users will often look
  // products up by their code, so search matches either field.
  const searchWhere: Prisma.ProductoWhereInput = term
    ? { OR: [{ descripcion: { contains: term } }, { codigo: { contains: term } }] }
    : {};

  const where: Prisma.ProductoWhereInput = {
    ...searchWhere,
    ...(status === 'activo' ? { activo: true } : status === 'inactivo' ? { activo: false } : {}),
  };

  return { searchWhere, where };
}

// Same target-aware pattern as unidades-medida.service.ts's
// isDescripcionConflict — only `descripcion` is unique on Producto.
function isDescripcionConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (typeof target === 'string') return target.includes('descripcion');
  if (Array.isArray(target)) return target.some((t) => String(t).includes('descripcion'));
  return false;
}

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  private toNullableDecimal(value?: number | null): Prisma.Decimal | null {
    return value == null ? null : new Prisma.Decimal(value);
  }

  // User-confirmed (design.md "Resolved Questions"): a Producto MUST NOT
  // reference an inactive UnidadMedida. This re-runs on every create AND
  // every update — including updates where unidadMedidaId is unchanged,
  // since the update DTO always carries it. If a producto's current
  // UnidadMedida is later deactivated, that producto cannot be saved again
  // until its unidadMedidaId is switched to an active unit (or the
  // original unit is reactivated). This is intentional, not a bug.
  private async assertUnidadMedidaActiva(unidadMedidaId: number): Promise<void> {
    const unidadMedida = await this.prisma.unidadMedida.findUnique({
      where: { id: unidadMedidaId },
    });
    if (!unidadMedida || !unidadMedida.activo) {
      throw new BadRequestException(UNIDAD_MEDIDA_INVALID_ERROR);
    }
  }

  // Same active-only enforcement as assertUnidadMedidaActiva, but for a
  // set of ids rather than a single one: every id sent by the client must
  // resolve to an existing, active Etiqueta.
  private async assertEtiquetasActivas(etiquetaIds: number[]): Promise<void> {
    if (etiquetaIds.length === 0) return;
    const etiquetas = await this.prisma.etiqueta.findMany({ where: { id: { in: etiquetaIds } } });
    if (etiquetas.length !== etiquetaIds.length || etiquetas.some((e) => !e.activo)) {
      throw new BadRequestException(ETIQUETAS_INVALID_ERROR);
    }
  }

  private mapIvaToEnum(alicuotaIva: number): 'IVA_21' | 'IVA_10_5' | 'IVA_EXENTO' {
    return IVA_TO_ENUM[alicuotaIva as keyof typeof IVA_TO_ENUM];
  }

  private mapProductoResult<T extends { alicuotaIva: string }>(
    producto: T
  ): Omit<T, 'alicuotaIva'> & { alicuotaIva: number } {
    return { ...producto, alicuotaIva: ENUM_TO_IVA[producto.alicuotaIva] };
  }

  async findAll(query: ListProductosQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildProductoWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.producto.findMany({
        where,
        select: PRODUCTO_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.producto.count({ where }),
      // Active count ignores the status filter (but honors search) —
      // mirrors unidades-medida.service.ts's findAll.
      this.prisma.producto.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data: data.map((p) => this.mapProductoResult(p)), total, activeCount };
  }

  async findOne(id: number) {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      select: PRODUCTO_SELECT,
    });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado.');
    }
    return this.mapProductoResult(producto);
  }

  async create(dto: CreateProductoDto, creadoPorId: number) {
    await this.assertUnidadMedidaActiva(dto.unidadMedidaId);
    await this.assertEtiquetasActivas(dto.etiquetaIds ?? []);

    const existing = await this.prisma.producto.findUnique({
      where: { descripcion: dto.descripcion },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    const precioVenta = new Prisma.Decimal(dto.precioVenta);

    try {
      const producto = await this.prisma.producto.create({
        data: {
          descripcion: dto.descripcion,
          codigo: dto.codigo,
          unidadMedidaId: dto.unidadMedidaId,
          cantidadInicial: new Prisma.Decimal(dto.cantidadInicial ?? 0),
          alertaStock: dto.alertaStock,
          cantidadMinima: new Prisma.Decimal(dto.cantidadMinima ?? 0),
          precioCompra: this.toNullableDecimal(dto.precioCompra),
          porcentajeGanancia: this.toNullableDecimal(dto.porcentajeGanancia),
          precioVenta,
          precioMayorista: this.toNullableDecimal(dto.precioMayorista),
          alicuotaIva: this.mapIvaToEnum(dto.alicuotaIva),
          creadoPorId,
          actualizadoPorId: creadoPorId,
          etiquetas: { connect: (dto.etiquetaIds ?? []).map((id) => ({ id })) },
        },
        select: PRODUCTO_SELECT,
      });
      return this.mapProductoResult(producto);
    } catch (error) {
      // The findUnique check above isn't atomic with this create — two
      // concurrent requests for the same descripcion can both pass it.
      // The DB's unique constraint is the real backstop.
      if (isDescripcionConflict(error)) {
        throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateProductoDto, actualizadoPorId: number) {
    const existing = await this.prisma.producto.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Producto no encontrado.');
    }

    // Unconditional re-check — re-runs on every update per design.md, even
    // when unidadMedidaId is unchanged (the update DTO always carries it).
    await this.assertUnidadMedidaActiva(dto.unidadMedidaId);
    await this.assertEtiquetasActivas(dto.etiquetaIds ?? []);

    // findUnique can't express NOT — descripcion IS unique, but we must
    // allow the row being edited to keep its own value.
    const descripcionOwner = await this.prisma.producto.findFirst({
      where: { descripcion: dto.descripcion, NOT: { id } },
    });
    if (descripcionOwner) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    const precioVenta = new Prisma.Decimal(dto.precioVenta);

    try {
      const producto = await this.prisma.producto.update({
        where: { id },
        data: {
          descripcion: dto.descripcion,
          codigo: dto.codigo,
          unidadMedidaId: dto.unidadMedidaId,
          cantidadInicial: new Prisma.Decimal(dto.cantidadInicial ?? 0),
          alertaStock: dto.alertaStock,
          cantidadMinima: new Prisma.Decimal(dto.cantidadMinima ?? 0),
          precioCompra: this.toNullableDecimal(dto.precioCompra),
          porcentajeGanancia: this.toNullableDecimal(dto.porcentajeGanancia),
          precioVenta,
          precioMayorista: this.toNullableDecimal(dto.precioMayorista),
          alicuotaIva: this.mapIvaToEnum(dto.alicuotaIva),
          activo: dto.activo,
          actualizadoPorId,
          etiquetas: { set: (dto.etiquetaIds ?? []).map((id) => ({ id })) },
        },
        select: PRODUCTO_SELECT,
      });
      return this.mapProductoResult(producto);
    } catch (error) {
      // Same TOCTOU backstop as create() — the pre-check above isn't atomic
      // with this update.
      if (isDescripcionConflict(error)) {
        throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
      }
      throw error;
    }
  }
}
