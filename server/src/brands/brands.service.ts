import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { ListBrandsQueryDto, BrandStatusFilter } from './dto/list-brands-query.dto';

const MARCA_SELECT = {
  id: true,
  marca: true,
  modelo: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true } },
};

const DUPLICATE_MARCA_MODELO_ERROR = 'Ya existe una marca con esa combinación de marca y modelo.';

export type BrandFilter = { search?: string; status?: BrandStatusFilter };

// Single source of truth for marca list/export filtering. Same shape as
// customers.service.ts's buildCustomerWhere — returns both pieces because
// findAll needs `searchWhere` on its own for the status-independent
// activeCount, while `where` is the combined filter used by the paginated
// list, its count, and the export.
function buildBrandWhere(filter: BrandFilter): {
  searchWhere: Prisma.MarcaWhereInput;
  where: Prisma.MarcaWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  // MySQL note: Prisma's `mode: 'insensitive'` filter option is NOT
  // supported on the MySQL connector (it throws at runtime). Plain
  // `contains` already respects the column's collation, which is
  // case-insensitive by default in this schema (utf8mb4 _general_ci /
  // _unicode_ci) — so this is already effectively case-insensitive here.
  const searchWhere: Prisma.MarcaWhereInput = term
    ? {
        OR: [{ marca: { contains: term } }, { modelo: { contains: term } }],
      }
    : {};

  const where: Prisma.MarcaWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}

type BrandRow = {
  marca: string;
  modelo: string;
  activo: boolean;
};

async function buildBrandsExcel(rows: BrandRow[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Marcas');
  sheet.columns = [
    { header: 'Marca', key: 'marca', width: 32 },
    { header: 'Modelo', key: 'modelo', width: 32 },
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
      marca: r.marca,
      modelo: r.modelo,
      estado: r.activo ? 'Activo' : 'Inactivo',
    });
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// Same target-aware pattern as customers.service.ts's uniqueTargetIncludes —
// the composite unique constraint's Prisma-generated target lists both
// columns, so checking for either is enough to identify this conflict.
function isMarcaModeloConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (typeof target === 'string') return target.includes('marca') && target.includes('modelo');
  if (Array.isArray(target)) {
    const fields = target.map((t) => String(t));
    return fields.includes('marca') && fields.includes('modelo');
  }
  return false;
}

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListBrandsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildBrandWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.marca.findMany({
        where,
        select: MARCA_SELECT,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.marca.count({ where }),
      // Active count ignores the status filter (but honors search) — this is
      // what the frontend's "N active brands visible" pill displays,
      // independent of which status tab the user has selected.
      this.prisma.marca.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async exportToExcel(filter: BrandFilter): Promise<Buffer> {
    const { where } = buildBrandWhere(filter);
    const rows = await this.prisma.marca.findMany({
      where,
      select: MARCA_SELECT,
      orderBy: { id: 'asc' }, // same ordering as the list for predictable output
    });
    return buildBrandsExcel(rows);
  }

  async findOne(id: number) {
    const marca = await this.prisma.marca.findUnique({ where: { id }, select: MARCA_SELECT });
    if (!marca) {
      throw new NotFoundException('Marca no encontrada.');
    }
    return marca;
  }

  async create(dto: CreateBrandDto, creadoPorId: number) {
    const existing = await this.prisma.marca.findUnique({
      where: { marca_modelo: { marca: dto.marca, modelo: dto.modelo } },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_MARCA_MODELO_ERROR);
    }

    try {
      return await this.prisma.marca.create({
        data: {
          marca: dto.marca,
          modelo: dto.modelo,
          activo: dto.activo,
          creadoPorId,
        },
        select: MARCA_SELECT,
      });
    } catch (error) {
      // The findUnique check above isn't atomic with this create — two
      // concurrent requests for the same marca+modelo can both pass it.
      // The DB's unique constraint is the real backstop.
      if (isMarcaModeloConflict(error)) {
        throw new ConflictException(DUPLICATE_MARCA_MODELO_ERROR);
      }
      throw error;
    }
  }

  // Unlike Cliente, Marca has no actualizadoPor relation (the user only
  // asked for a creator, not an updater) — so update() doesn't need the
  // acting user's id at all.
  async update(id: number, dto: UpdateBrandDto) {
    const existing = await this.prisma.marca.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Marca no encontrada.');
    }

    // findUnique on the composite key can't express NOT — marca+modelo IS
    // unique, but we must allow the row being edited to keep its own values.
    const conflictOwner = await this.prisma.marca.findFirst({
      where: { marca: dto.marca, modelo: dto.modelo, NOT: { id } },
    });
    if (conflictOwner) {
      throw new ConflictException(DUPLICATE_MARCA_MODELO_ERROR);
    }

    try {
      return await this.prisma.marca.update({
        where: { id },
        data: {
          marca: dto.marca,
          modelo: dto.modelo,
          activo: dto.activo,
        },
        select: MARCA_SELECT,
      });
    } catch (error) {
      // Same TOCTOU backstop as create() — the pre-check above isn't atomic
      // with this update.
      if (isMarcaModeloConflict(error)) {
        throw new ConflictException(DUPLICATE_MARCA_MODELO_ERROR);
      }
      throw error;
    }
  }
}
