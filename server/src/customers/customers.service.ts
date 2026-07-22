import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto, CustomerStatusFilter } from './dto/list-customers-query.dto';
import { ID_TYPE_LABELS, IdType } from './customer.constants';

const CUSTOMER_SELECT = {
  id: true,
  razonSocial: true,
  tipoIdentificacion: true,
  identificacion: true,
  telefono: true,
  domicilio: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
};

const DUPLICATE_ID_ERROR = 'La identificación ya está registrada.';
const DUPLICATE_RAZON_SOCIAL_ERROR = 'Ya existe un cliente con esa razón social.';

export type CustomerFilter = { search?: string; status?: CustomerStatusFilter };

// Single source of truth for cliente list/export filtering. Returns BOTH
// pieces because findAll needs `searchWhere` on its own for the
// status-independent activeCount, while `where` is the combined filter used
// by the paginated list, its count, and the export. The MySQL collation note
// (Prisma `mode: 'insensitive'` is unsupported on MySQL; `contains` is already
// case-insensitive under utf8mb4 _*_ci) lives here now, next to the OR block.
function buildCustomerWhere(filter: CustomerFilter): {
  searchWhere: Prisma.ClienteWhereInput;
  where: Prisma.ClienteWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  // MySQL note: Prisma's `mode: 'insensitive'` filter option is NOT
  // supported on the MySQL connector (it throws at runtime). Plain
  // `contains` already respects the column's collation, which is
  // case-insensitive by default in this schema (utf8mb4 _general_ci /
  // _unicode_ci) — so this is already effectively case-insensitive here.
  const searchWhere: Prisma.ClienteWhereInput = term
    ? {
        OR: [
          { razonSocial: { contains: term } },
          { identificacion: { contains: term } },
          { telefono: { contains: term } },
        ],
      }
    : {};

  const where: Prisma.ClienteWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}

type CustomerRow = {
  razonSocial: string;
  tipoIdentificacion: string;
  identificacion: string | null;
  telefono: string | null;
  domicilio: string | null;
  activo: boolean;
};

async function buildCustomersExcel(rows: CustomerRow[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Clientes');
  sheet.columns = [
    { header: 'Razón Social', key: 'razonSocial', width: 32 },
    { header: 'Tipo de identificación', key: 'tipoIdentificacion', width: 22 },
    { header: 'Identificación', key: 'identificacion', width: 18 },
    { header: 'Teléfono', key: 'telefono', width: 16 },
    { header: 'Domicilio', key: 'domicilio', width: 32 },
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
      razonSocial: r.razonSocial,
      tipoIdentificacion: ID_TYPE_LABELS[r.tipoIdentificacion as IdType] ?? r.tipoIdentificacion,
      identificacion: r.identificacion ?? '',
      telefono: r.telefono ?? '',
      domicilio: r.domicilio ?? '',
      estado: r.activo ? 'Activo' : 'Inactivo',
    });
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// Empty optional fields come in as '' from the form — normalize to NULL
// (rather than leaving '') both to keep the data clean and so
// identificacion's unique index doesn't treat two blank clients as
// duplicates of each other. Using `null` (not `undefined`) matters for
// update(): Prisma skips `undefined` fields entirely but writes `null`,
// so this is also how a user clears a previously-set value.
function normalizeOptional(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Same target-aware pattern as users.service.ts's uniqueTargetIncludes —
// here only `identificacion` is unique, but the pattern is kept for
// consistency and forward safety.
function uniqueTargetIncludes(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (typeof target === 'string') return target.includes(field);
  if (Array.isArray(target)) return target.some((t) => String(t).includes(field));
  return false;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListCustomersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const sortDir = query.sortDir ?? 'asc';
    const { searchWhere, where } = buildCustomerWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.cliente.findMany({
        where,
        select: CUSTOMER_SELECT,
        orderBy: { id: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.cliente.count({ where }),
      // Active count ignores the status filter (but honors search) — this is
      // what the frontend's "N active customers visible" pill displays,
      // independent of which status tab the user has selected.
      this.prisma.cliente.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async exportToExcel(filter: CustomerFilter): Promise<Buffer> {
    const { where } = buildCustomerWhere(filter);
    const rows = await this.prisma.cliente.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: { id: 'asc' }, // same ordering as the list for predictable output
    });
    return buildCustomersExcel(rows);
  }

  async findOne(id: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id }, select: CUSTOMER_SELECT });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    return cliente;
  }

  async create(dto: CreateCustomerDto, creadoPorId: number) {
    const razonSocial = dto.razonSocial.trim();
    const identificacion = normalizeOptional(dto.identificacion);
    const telefono = normalizeOptional(dto.telefono);
    const domicilio = normalizeOptional(dto.domicilio);

    // razonSocial's unique index sits on a case-insensitive collation
    // (utf8mb4_unicode_ci), so this equality check already ignores case.
    const existingRazonSocial = await this.prisma.cliente.findUnique({ where: { razonSocial } });
    if (existingRazonSocial) {
      throw new ConflictException(DUPLICATE_RAZON_SOCIAL_ERROR);
    }

    if (identificacion !== null) {
      const existingId = await this.prisma.cliente.findUnique({ where: { identificacion } });
      if (existingId) {
        throw new ConflictException(DUPLICATE_ID_ERROR);
      }
    }

    try {
      return await this.prisma.cliente.create({
        data: {
          razonSocial,
          tipoIdentificacion: dto.tipoIdentificacion,
          identificacion,
          telefono,
          domicilio,
          activo: dto.activo,
          creadoPorId,
          actualizadoPorId: creadoPorId,
        },
        select: CUSTOMER_SELECT,
      });
    } catch (error) {
      // The findUnique checks above aren't atomic with this create — two
      // concurrent requests for the same value can both pass them.
      // The DB's unique constraints are the real backstop.
      if (uniqueTargetIncludes(error, 'identificacion')) {
        throw new ConflictException(DUPLICATE_ID_ERROR);
      }
      if (uniqueTargetIncludes(error, 'razonSocial')) {
        throw new ConflictException(DUPLICATE_RAZON_SOCIAL_ERROR);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateCustomerDto, actualizadoPorId: number) {
    const existing = await this.prisma.cliente.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cliente no encontrado.');
    }

    const razonSocial = dto.razonSocial.trim();
    const identificacion = normalizeOptional(dto.identificacion);
    const telefono = normalizeOptional(dto.telefono);
    const domicilio = normalizeOptional(dto.domicilio);

    // findFirst can't rely on findUnique's shortcut here — we must allow the
    // row being edited to keep its own value while still rejecting a value
    // owned by any other row.
    const razonSocialOwner = await this.prisma.cliente.findFirst({
      where: { razonSocial, NOT: { id } },
    });
    if (razonSocialOwner) {
      throw new ConflictException(DUPLICATE_RAZON_SOCIAL_ERROR);
    }

    if (identificacion !== null) {
      const identificacionOwner = await this.prisma.cliente.findFirst({
        where: { identificacion, NOT: { id } },
      });
      if (identificacionOwner) {
        throw new ConflictException(DUPLICATE_ID_ERROR);
      }
    }

    try {
      return await this.prisma.cliente.update({
        where: { id },
        data: {
          razonSocial,
          tipoIdentificacion: dto.tipoIdentificacion,
          identificacion,
          telefono,
          domicilio,
          activo: dto.activo,
          actualizadoPorId,
        },
        select: CUSTOMER_SELECT,
      });
    } catch (error) {
      // Same TOCTOU backstop as create() — the pre-checks above aren't
      // atomic with this update.
      if (uniqueTargetIncludes(error, 'identificacion')) {
        throw new ConflictException(DUPLICATE_ID_ERROR);
      }
      if (uniqueTargetIncludes(error, 'razonSocial')) {
        throw new ConflictException(DUPLICATE_RAZON_SOCIAL_ERROR);
      }
      throw error;
    }
  }
}
