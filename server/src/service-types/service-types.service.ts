import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ListServiceTypesQueryDto, ServiceTypeStatusFilter } from './dto/list-service-types-query.dto';

const SERVICE_TYPE_SELECT = {
  id: true,
  descripcion: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
  actualizadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
};

const DUPLICATE_DESCRIPCION_ERROR = 'Ya existe un tipo de servicio con esa descripción.';

export type ServiceTypeFilter = { search?: string; status?: ServiceTypeStatusFilter };

// Single source of truth for tipo-de-servicio list/export filtering. Returns
// BOTH pieces because findAll needs `searchWhere` on its own for the
// status-independent activeCount, while `where` is the combined filter used
// by the paginated list, its count, and the export. Mirrors
// colors.service.ts's buildColorWhere.
function buildServiceTypeWhere(filter: ServiceTypeFilter): {
  searchWhere: Prisma.TipoServicioWhereInput;
  where: Prisma.TipoServicioWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  // MySQL note: Prisma's `mode: 'insensitive'` filter option is NOT
  // supported on the MySQL connector (it throws at runtime). Plain
  // `contains` already respects the column's collation, which is
  // case-insensitive by default in this schema (utf8mb4 _general_ci /
  // _unicode_ci) — so this is already effectively case-insensitive here.
  const searchWhere: Prisma.TipoServicioWhereInput = term
    ? { descripcion: { contains: term } }
    : {};

  const where: Prisma.TipoServicioWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}

type ServiceTypeRow = {
  descripcion: string;
  activo: boolean;
  createdAt: Date;
  creadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
};

// Same name-fallback logic as the list table: nombre + apellido, falling
// back to username, or empty string when there's no creator.
function creadoPorLabel(creadoPor: ServiceTypeRow['creadoPor']): string {
  if (!creadoPor) return '';
  return [creadoPor.nombre, creadoPor.apellido].filter(Boolean).join(' ') || creadoPor.username;
}

async function buildServiceTypesExcel(rows: ServiceTypeRow[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Tipos de servicio');
  sheet.columns = [
    { header: 'Descripción', key: 'descripcion', width: 32 },
    { header: 'Creado por', key: 'creadoPor', width: 24 },
    { header: 'Fecha de creación', key: 'fechaCreacion', width: 22 },
    { header: 'Estado', key: 'estado', width: 12 },
  ];
  // Brand rose (matches the app's primary button color) with white bold text
  // for header contrast.
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF43F5E' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  for (const r of rows) {
    sheet.addRow({
      descripcion: r.descripcion,
      creadoPor: creadoPorLabel(r.creadoPor),
      fechaCreacion: r.createdAt.toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
      estado: r.activo ? 'Activo' : 'Inactivo',
    });
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// Same target-aware pattern as customers.service.ts's uniqueTargetIncludes —
// here only `descripcion` is unique. The column's collation (utf8mb4_unicode_ci,
// confirmed case-insensitive) means the DB constraint itself already treats
// "Cambio de aceite"/"cambio de aceite" as the same value, so no manual
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
export class ServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListServiceTypesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildServiceTypeWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.tipoServicio.findMany({
        where,
        select: SERVICE_TYPE_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tipoServicio.count({ where }),
      // Active count ignores the status filter (but honors search) — this is
      // what the frontend's "N active tipos de servicio visible" pill
      // displays, independent of which status tab the user has selected.
      this.prisma.tipoServicio.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async exportToExcel(filter: ServiceTypeFilter): Promise<Buffer> {
    const { where } = buildServiceTypeWhere(filter);
    const rows = await this.prisma.tipoServicio.findMany({
      where,
      select: SERVICE_TYPE_SELECT,
      orderBy: { id: 'asc' }, // same ordering as the list for predictable output
    });
    return buildServiceTypesExcel(rows);
  }

  async findOne(id: number) {
    const serviceType = await this.prisma.tipoServicio.findUnique({
      where: { id },
      select: SERVICE_TYPE_SELECT,
    });
    if (!serviceType) {
      throw new NotFoundException('Tipo de servicio no encontrado.');
    }
    return serviceType;
  }

  async create(dto: CreateServiceTypeDto, creadoPorId: number) {
    const existing = await this.prisma.tipoServicio.findUnique({
      where: { descripcion: dto.descripcion },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.tipoServicio.create({
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          creadoPorId,
          actualizadoPorId: creadoPorId,
        },
        select: SERVICE_TYPE_SELECT,
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

  // Unlike Color, TipoServicio has an actualizadoPor relation (like
  // Cliente) — update() MUST take the acting user's id and stamp
  // actualizadoPorId, following customers.service.ts's update(), NOT
  // colors.service.ts's parameterless update().
  async update(id: number, dto: UpdateServiceTypeDto, actualizadoPorId: number) {
    const existing = await this.prisma.tipoServicio.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tipo de servicio no encontrado.');
    }

    // findUnique can't express NOT — descripcion IS unique, but we must
    // allow the row being edited to keep its own value.
    const descripcionOwner = await this.prisma.tipoServicio.findFirst({
      where: { descripcion: dto.descripcion, NOT: { id } },
    });
    if (descripcionOwner) {
      throw new ConflictException(DUPLICATE_DESCRIPCION_ERROR);
    }

    try {
      return await this.prisma.tipoServicio.update({
        where: { id },
        data: {
          descripcion: dto.descripcion,
          activo: dto.activo,
          actualizadoPorId,
        },
        select: SERVICE_TYPE_SELECT,
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
