import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ListVehiclesQueryDto, VehicleStatusFilter } from './dto/list-vehicles-query.dto';

const DUPLICATE_PATENTE_ERROR = 'La patente ya está registrada.';

const VEHICLE_SELECT = {
  id: true,
  anio: true,
  kilometraje: true,
  patente: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  marca: { select: { id: true, marca: true, modelo: true } },
  color: { select: { id: true, descripcion: true } },
  cliente: { select: { id: true, razonSocial: true } },
  creadoPor: { select: { id: true, username: true } },
  actualizadoPor: { select: { id: true, username: true } },
};

export type VehicleFilter = { search?: string; status?: VehicleStatusFilter; clienteId?: number };

// Single source of truth for vehiculo list/export filtering. Returns BOTH
// pieces because findAll needs `searchWhere` on its own for the
// status-independent activeCount, while `where` is the combined filter used
// by the paginated list, its count, and the export. Same pattern as
// buildCustomerWhere in customers.service.ts.
function buildVehicleWhere(filter: VehicleFilter): {
  searchWhere: Prisma.VehiculoWhereInput;
  where: Prisma.VehiculoWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  // MySQL note: Prisma's `mode: 'insensitive'` filter option is NOT
  // supported on the MySQL connector (it throws at runtime). Plain
  // `contains` already respects the column's collation, which is
  // case-insensitive by default in this schema (utf8mb4 _general_ci /
  // _unicode_ci) — so this is already effectively case-insensitive here.
  // Vehiculo has no free-text field of its own, so search reaches into
  // its to-one relations — `contains` nested inside `OR` (not `some`,
  // which is for to-many relations).
  const searchWhere: Prisma.VehiculoWhereInput = {
    ...(term
      ? {
          OR: [
            { marca: { marca: { contains: term } } },
            { marca: { modelo: { contains: term } } },
            { cliente: { razonSocial: { contains: term } } },
            { patente: { contains: term } },
          ],
        }
      : {}),
    // clienteId scopes the vehículo picker to a single cliente (D10) — folded
    // into searchWhere (not just `where`) so it also narrows the
    // status-independent activeCount below.
    ...(filter.clienteId ? { clienteId: filter.clienteId } : {}),
  };

  const where: Prisma.VehiculoWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}

type VehicleRow = {
  anio: number;
  kilometraje: number;
  patente: string | null;
  activo: boolean;
  marca: { marca: string; modelo: string };
  color: { descripcion: string };
  cliente: { razonSocial: string };
};

async function buildVehiclesExcel(rows: VehicleRow[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Vehículos');
  sheet.columns = [
    { header: 'Marca', key: 'marca', width: 28 },
    { header: 'Patente', key: 'patente', width: 14 },
    { header: 'Color', key: 'color', width: 16 },
    { header: 'Año', key: 'anio', width: 10 },
    { header: 'Kilometraje', key: 'kilometraje', width: 16 },
    { header: 'Cliente', key: 'cliente', width: 32 },
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
      marca: `${r.marca.marca} ${r.marca.modelo}`,
      patente: r.patente ?? '',
      color: r.color.descripcion,
      anio: r.anio,
      kilometraje: r.kilometraje,
      cliente: r.cliente.razonSocial,
      estado: r.activo ? 'Activo' : 'Inactivo',
    });
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// Empty optional fields come in as '' from the form — normalize to NULL
// (rather than leaving '') both to keep the data clean and so patente's
// unique index doesn't treat two blank vehicles as duplicates of each
// other. Using `null` (not `undefined`) matters for update(): Prisma skips
// `undefined` fields entirely but writes `null`, so this is also how a user
// clears a previously-set value. Mirrors customers.service.ts's
// normalizeOptional.
function normalizeOptional(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Same target-aware pattern as customers.service.ts's uniqueTargetIncludes.
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
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListVehiclesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const sortDir = query.sortDir ?? 'asc';
    const { searchWhere, where } = buildVehicleWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.vehiculo.findMany({
        where,
        select: VEHICLE_SELECT,
        orderBy: { id: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vehiculo.count({ where }),
      // Active count ignores the status filter (but honors search) — this is
      // what the frontend's "N active vehicles visible" pill displays,
      // independent of which status tab the user has selected.
      this.prisma.vehiculo.count({ where: { ...searchWhere, activo: true } }),
    ]);

    return { data, total, activeCount };
  }

  async exportToExcel(filter: VehicleFilter): Promise<Buffer> {
    const { where } = buildVehicleWhere(filter);
    const rows = await this.prisma.vehiculo.findMany({
      where,
      select: VEHICLE_SELECT,
      orderBy: { id: 'asc' }, // same ordering as the list for predictable output
    });
    return buildVehiclesExcel(rows);
  }

  async findOne(id: number) {
    const vehiculo = await this.prisma.vehiculo.findUnique({
      where: { id },
      select: VEHICLE_SELECT,
    });
    if (!vehiculo) {
      throw new NotFoundException('Vehículo no encontrado.');
    }
    return vehiculo;
  }

  // Marca/Color/Cliente must not only exist but be active — an inactive
  // record shouldn't be assignable to a new or edited vehicle.
  private async assertReferencesExist(dto: { marcaId: number; colorId: number; clienteId: number }) {
    const [marca, color, cliente] = await Promise.all([
      this.prisma.marca.findUnique({ where: { id: dto.marcaId } }),
      this.prisma.color.findUnique({ where: { id: dto.colorId } }),
      this.prisma.cliente.findUnique({ where: { id: dto.clienteId } }),
    ]);
    if (!marca || !marca.activo) {
      throw new NotFoundException('Marca no encontrada.');
    }
    if (!color || !color.activo) {
      throw new NotFoundException('Color no encontrado.');
    }
    if (!cliente || !cliente.activo) {
      throw new NotFoundException('Cliente no encontrado.');
    }
  }

  async create(dto: CreateVehicleDto, creadoPorId: number) {
    await this.assertReferencesExist(dto);

    const patente = normalizeOptional(dto.patente);
    if (patente !== null) {
      const existingPatente = await this.prisma.vehiculo.findUnique({ where: { patente } });
      if (existingPatente) {
        throw new ConflictException(DUPLICATE_PATENTE_ERROR);
      }
    }

    try {
      return await this.prisma.vehiculo.create({
        data: {
          marcaId: dto.marcaId,
          colorId: dto.colorId,
          anio: dto.anio,
          kilometraje: dto.kilometraje,
          patente,
          clienteId: dto.clienteId,
          activo: dto.activo,
          creadoPorId,
        },
        select: VEHICLE_SELECT,
      });
    } catch (error) {
      // The findUnique check above isn't atomic with this create — two
      // concurrent requests for the same plate can both pass it. The DB's
      // unique constraint is the real backstop (same TOCTOU-safe pattern as
      // customers.service.ts's identificacion/razonSocial checks).
      if (uniqueTargetIncludes(error, 'patente')) {
        throw new ConflictException(DUPLICATE_PATENTE_ERROR);
      }
      throw error;
    }
  }

  // Like Cliente and TipoServicio, Vehiculo has an actualizadoPor relation —
  // update() takes the acting user's id and stamps actualizadoPorId.
  async update(id: number, dto: UpdateVehicleDto, actualizadoPorId: number) {
    const existing = await this.prisma.vehiculo.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Vehículo no encontrado.');
    }

    await this.assertReferencesExist(dto);

    const patente = normalizeOptional(dto.patente);
    if (patente !== null) {
      // findFirst can't rely on findUnique's shortcut here — we must allow
      // the vehicle being edited to keep its own value while still
      // rejecting a value owned by any other vehicle.
      const patenteOwner = await this.prisma.vehiculo.findFirst({
        where: { patente, NOT: { id } },
      });
      if (patenteOwner) {
        throw new ConflictException(DUPLICATE_PATENTE_ERROR);
      }
    }

    try {
      return await this.prisma.vehiculo.update({
        where: { id },
        data: {
          marcaId: dto.marcaId,
          colorId: dto.colorId,
          anio: dto.anio,
          kilometraje: dto.kilometraje,
          patente,
          clienteId: dto.clienteId,
          activo: dto.activo,
          actualizadoPorId,
        },
        select: VEHICLE_SELECT,
      });
    } catch (error) {
      // Same TOCTOU backstop as create() — the pre-check above isn't
      // atomic with this update.
      if (uniqueTargetIncludes(error, 'patente')) {
        throw new ConflictException(DUPLICATE_PATENTE_ERROR);
      }
      throw error;
    }
  }
}
