import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

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

  async findAll() {
    return this.prisma.cliente.findMany({ select: CUSTOMER_SELECT });
  }

  async findOne(id: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id }, select: CUSTOMER_SELECT });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    return cliente;
  }

  async create(dto: CreateCustomerDto, creadoPorId: number) {
    const existing = await this.prisma.cliente.findUnique({
      where: { identificacion: dto.identificacion },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_ID_ERROR);
    }

    try {
      return await this.prisma.cliente.create({
        data: {
          razonSocial: dto.razonSocial,
          tipoIdentificacion: dto.tipoIdentificacion,
          identificacion: dto.identificacion,
          telefono: dto.telefono,
          domicilio: dto.domicilio,
          activo: dto.activo,
          creadoPorId,
          actualizadoPorId: creadoPorId,
        },
        select: CUSTOMER_SELECT,
      });
    } catch (error) {
      // The findUnique check above isn't atomic with this create — two
      // concurrent requests for the same identificacion can both pass it.
      // The DB's unique constraint is the real backstop.
      if (uniqueTargetIncludes(error, 'identificacion')) {
        throw new ConflictException(DUPLICATE_ID_ERROR);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateCustomerDto, actualizadoPorId: number) {
    const existing = await this.prisma.cliente.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cliente no encontrado.');
    }

    // findUnique can't express NOT — identificacion IS unique, but we must
    // allow the row being edited to keep its own value.
    const identificacionOwner = await this.prisma.cliente.findFirst({
      where: { identificacion: dto.identificacion, NOT: { id } },
    });
    if (identificacionOwner) {
      throw new ConflictException(DUPLICATE_ID_ERROR);
    }

    try {
      return await this.prisma.cliente.update({
        where: { id },
        data: {
          razonSocial: dto.razonSocial,
          tipoIdentificacion: dto.tipoIdentificacion,
          identificacion: dto.identificacion,
          telefono: dto.telefono,
          domicilio: dto.domicilio,
          activo: dto.activo,
          actualizadoPorId,
        },
        select: CUSTOMER_SELECT,
      });
    } catch (error) {
      // Same TOCTOU backstop as create() — the pre-check above isn't atomic
      // with this update.
      if (uniqueTargetIncludes(error, 'identificacion')) {
        throw new ConflictException(DUPLICATE_ID_ERROR);
      }
      throw error;
    }
  }
}
