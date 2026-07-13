import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnidadMedidaDto } from './dto/create-unidad-medida.dto';
import { UpdateUnidadMedidaDto } from './dto/update-unidad-medida.dto';
import { ListUnidadesMedidaQueryDto, UnidadMedidaStatusFilter } from './dto/list-unidades-medida-query.dto';

const UNIDAD_MEDIDA_SELECT = {
  id: true,
  descripcion: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
  actualizadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
};

const DUPLICATE_DESCRIPCION_ERROR = 'Ya existe una unidad de medida con esa descripción.';

export type UnidadMedidaFilter = { search?: string; status?: UnidadMedidaStatusFilter };

// Single source of truth for unidad-de-medida list filtering. Returns BOTH
// pieces because findAll needs `searchWhere` on its own for the
// status-independent activeCount, while `where` is the combined filter used
// by the paginated list and its count. Mirrors service-types.service.ts's
// buildServiceTypeWhere.
function buildUnidadMedidaWhere(filter: UnidadMedidaFilter): {
  searchWhere: Prisma.UnidadMedidaWhereInput;
  where: Prisma.UnidadMedidaWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  // MySQL note: Prisma's `mode: 'insensitive'` filter option is NOT
  // supported on the MySQL connector (it throws at runtime). Plain
  // `contains` already respects the column's collation, which is
  // case-insensitive by default in this schema (utf8mb4 _general_ci /
  // _unicode_ci) — so this is already effectively case-insensitive here.
  const searchWhere: Prisma.UnidadMedidaWhereInput = term
    ? { descripcion: { contains: term } }
    : {};

  const where: Prisma.UnidadMedidaWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}

// Same target-aware pattern as service-types.service.ts's isDescripcionConflict
// — here only `descripcion` is unique. The column's collation
// (utf8mb4_unicode_ci, confirmed case-insensitive) means the DB constraint
// itself already treats "Litro"/"litro" as the same value, so no manual
// normalization is needed.
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
export class UnidadesMedidaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListUnidadesMedidaQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildUnidadMedidaWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.unidadMedida.findMany({
        where,
        select: UNIDAD_MEDIDA_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.unidadMedida.count({ where }),
      // Active count ignores the status filter (but honors search) — this is
      // what the frontend's "N active unidades de medida visible" pill
      // displays, independent of which status tab the user has selected.
      this.prisma.unidadMedida.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async findOne(id: number) {
    const unidadMedida = await this.prisma.unidadMedida.findUnique({
      where: { id },
      select: UNIDAD_MEDIDA_SELECT,
    });
    if (!unidadMedida) {
      throw new NotFoundException('Unidad de medida no encontrada.');
    }
    return unidadMedida;
  }

  async create(dto: CreateUnidadMedidaDto, creadoPorId: number) {
    const existing = await this.prisma.unidadMedida.findUnique({
      where: { descripcion: dto.descripcion },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.unidadMedida.create({
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          creadoPorId,
          actualizadoPorId: creadoPorId,
        },
        select: UNIDAD_MEDIDA_SELECT,
      });
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

  // UnidadMedida has an actualizadoPor relation — update() MUST take the
  // acting user's id and stamp actualizadoPorId, mirroring
  // service-types.service.ts's update(), never touching creadoPorId.
  async update(id: number, dto: UpdateUnidadMedidaDto, actualizadoPorId: number) {
    const existing = await this.prisma.unidadMedida.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Unidad de medida no encontrada.');
    }

    // findUnique can't express NOT — descripcion IS unique, but we must
    // allow the row being edited to keep its own value.
    const descripcionOwner = await this.prisma.unidadMedida.findFirst({
      where: { descripcion: dto.descripcion, NOT: { id } },
    });
    if (descripcionOwner) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.unidadMedida.update({
        where: { id },
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          actualizadoPorId,
        },
        select: UNIDAD_MEDIDA_SELECT,
      });
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
