import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ListVehiclesQueryDto, VehicleStatusFilter } from './dto/list-vehicles-query.dto';

const VEHICLE_SELECT = {
  id: true,
  anio: true,
  kilometraje: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  marca: { select: { id: true, marca: true, modelo: true } },
  color: { select: { id: true, descripcion: true } },
  cliente: { select: { id: true, razonSocial: true } },
  creadoPor: { select: { id: true, username: true } },
};

export type VehicleFilter = { search?: string; status?: VehicleStatusFilter };

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
  const searchWhere: Prisma.VehiculoWhereInput = term
    ? {
        OR: [
          { marca: { marca: { contains: term } } },
          { marca: { modelo: { contains: term } } },
          { cliente: { razonSocial: { contains: term } } },
        ],
      }
    : {};

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

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListVehiclesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { searchWhere, where } = buildVehicleWhere(query);

    const [data, total, activeCount] = await this.prisma.$transaction([
      this.prisma.vehiculo.findMany({
        where,
        select: VEHICLE_SELECT,
        orderBy: { id: 'asc' },
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

    return this.prisma.vehiculo.create({
      data: {
        marcaId: dto.marcaId,
        colorId: dto.colorId,
        anio: dto.anio,
        kilometraje: dto.kilometraje,
        clienteId: dto.clienteId,
        activo: dto.activo,
        creadoPorId,
      },
      select: VEHICLE_SELECT,
    });
  }

  // Unlike Cliente, Vehiculo has no actualizadoPor relation (the user only
  // asked for a creator, not an updater) — so update() doesn't need the
  // acting user's id at all.
  async update(id: number, dto: UpdateVehicleDto) {
    const existing = await this.prisma.vehiculo.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Vehículo no encontrado.');
    }

    await this.assertReferencesExist(dto);

    return this.prisma.vehiculo.update({
      where: { id },
      data: {
        marcaId: dto.marcaId,
        colorId: dto.colorId,
        anio: dto.anio,
        kilometraje: dto.kilometraje,
        clienteId: dto.clienteId,
        activo: dto.activo,
      },
      select: VEHICLE_SELECT,
    });
  }
}
