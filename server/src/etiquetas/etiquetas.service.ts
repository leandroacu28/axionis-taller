import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEtiquetaDto } from './dto/create-etiqueta.dto';
import { UpdateEtiquetaDto } from './dto/update-etiqueta.dto';
import { ListEtiquetasQueryDto, EtiquetaStatusFilter } from './dto/list-etiquetas-query.dto';

const ETIQUETA_SELECT = {
  id: true,
  descripcion: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
  actualizadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
};

const DUPLICATE_DESCRIPCION_ERROR = 'Ya existe una etiqueta con esa descripción.';

export type EtiquetaFilter = { search?: string; status?: EtiquetaStatusFilter };

// Mirrors colors.service.ts's buildColorWhere. Returns both `searchWhere`
// (status-independent, used for the activeCount) and `where` (combined
// filter for the paginated list).
function buildEtiquetaWhere(filter: EtiquetaFilter): {
  searchWhere: Prisma.EtiquetaWhereInput;
  where: Prisma.EtiquetaWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  const searchWhere: Prisma.EtiquetaWhereInput = term
    ? { descripcion: { contains: term } }
    : {};

  const where: Prisma.EtiquetaWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}

// Same target-aware pattern as colors.service.ts's isDescripcionConflict —
// only `descripcion` is unique on Etiqueta.
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
export class EtiquetasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListEtiquetasQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildEtiquetaWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.etiqueta.findMany({
        where,
        select: ETIQUETA_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.etiqueta.count({ where }),
      // Active count ignores the status filter (but honors search) — mirrors
      // colors.service.ts's findAll.
      this.prisma.etiqueta.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async findOne(id: number) {
    const etiqueta = await this.prisma.etiqueta.findUnique({ where: { id }, select: ETIQUETA_SELECT });
    if (!etiqueta) {
      throw new NotFoundException('Etiqueta no encontrada.');
    }
    return etiqueta;
  }

  async create(dto: CreateEtiquetaDto, creadoPorId: number) {
    const existing = await this.prisma.etiqueta.findUnique({ where: { descripcion: dto.descripcion } });
    if (existing) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.etiqueta.create({
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          creadoPorId,
        },
        select: ETIQUETA_SELECT,
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

  // Like Color, Etiqueta has an actualizadoPor relation — update() takes the
  // acting user's id and stamps actualizadoPorId.
  async update(id: number, dto: UpdateEtiquetaDto, actualizadoPorId: number) {
    const existing = await this.prisma.etiqueta.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Etiqueta no encontrada.');
    }

    // findUnique can't express NOT — descripcion IS unique, but we must
    // allow the row being edited to keep its own value.
    const descripcionOwner = await this.prisma.etiqueta.findFirst({
      where: { descripcion: dto.descripcion, NOT: { id } },
    });
    if (descripcionOwner) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.etiqueta.update({
        where: { id },
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          actualizadoPorId,
        },
        select: ETIQUETA_SELECT,
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
