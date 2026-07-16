import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiagnosticoDto } from './dto/create-diagnostico.dto';
import { UpdateDiagnosticoDto } from './dto/update-diagnostico.dto';
import { ListDiagnosticosQueryDto, DiagnosticoStatusFilter } from './dto/list-diagnosticos-query.dto';

const DIAGNOSTICO_SELECT = {
  id: true,
  descripcion: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
  actualizadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
};

const DUPLICATE_DESCRIPCION_ERROR = 'Ya existe un diagnóstico con esa descripción.';

export type DiagnosticoFilter = { search?: string; status?: DiagnosticoStatusFilter };

// Single source of truth for diagnostico list filtering. Returns BOTH
// pieces because findAll needs `searchWhere` on its own for the
// status-independent activeCount, while `where` is the combined filter used
// by the paginated list and its count. Mirrors colors.service.ts's
// buildColorWhere.
function buildDiagnosticoWhere(filter: DiagnosticoFilter): {
  searchWhere: Prisma.DiagnosticoWhereInput;
  where: Prisma.DiagnosticoWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  // MySQL note: Prisma's `mode: 'insensitive'` filter option is NOT
  // supported on the MySQL connector (it throws at runtime). Plain
  // `contains` already respects the column's collation, which is
  // case-insensitive by default in this schema (utf8mb4 _general_ci /
  // _unicode_ci) — so this is already effectively case-insensitive here.
  const searchWhere: Prisma.DiagnosticoWhereInput = term
    ? { descripcion: { contains: term } }
    : {};

  const where: Prisma.DiagnosticoWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}

// Same target-aware pattern as customers.service.ts's uniqueTargetIncludes —
// here only `descripcion` is unique. The column's collation (utf8mb4_unicode_ci,
// confirmed case-insensitive) means the DB constraint itself already treats
// "Falla de frenos"/"falla de frenos" as the same value, so no manual
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
export class DiagnosticosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListDiagnosticosQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildDiagnosticoWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.diagnostico.findMany({
        where,
        select: DIAGNOSTICO_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.diagnostico.count({ where }),
      // Active count ignores the status filter (but honors search) — this is
      // what the frontend's "N active diagnósticos visible" pill displays,
      // independent of which status tab the user has selected.
      this.prisma.diagnostico.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async findOne(id: number) {
    const diagnostico = await this.prisma.diagnostico.findUnique({
      where: { id },
      select: DIAGNOSTICO_SELECT,
    });
    if (!diagnostico) {
      throw new NotFoundException('Diagnóstico no encontrado.');
    }
    return diagnostico;
  }

  async create(dto: CreateDiagnosticoDto, creadoPorId: number) {
    const existing = await this.prisma.diagnostico.findUnique({
      where: { descripcion: dto.descripcion },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.diagnostico.create({
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          creadoPorId,
        },
        select: DIAGNOSTICO_SELECT,
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

  // Like Color, Diagnostico has an actualizadoPor relation — update() takes
  // the acting user's id and stamps actualizadoPorId.
  async update(id: number, dto: UpdateDiagnosticoDto, actualizadoPorId: number) {
    const existing = await this.prisma.diagnostico.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Diagnóstico no encontrado.');
    }

    // findUnique can't express NOT — descripcion IS unique, but we must
    // allow the row being edited to keep its own value.
    const descripcionOwner = await this.prisma.diagnostico.findFirst({
      where: { descripcion: dto.descripcion, NOT: { id } },
    });
    if (descripcionOwner) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.diagnostico.update({
        where: { id },
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          actualizadoPorId,
        },
        select: DIAGNOSTICO_SELECT,
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
