import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MASTER_USERNAME } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SALT_ROUNDS } from './user.constants';

// select (whitelist) rather than destructuring passwordHash off the result
// (auth.service.ts's approach) — a whitelist can't accidentally leak a new
// sensitive column added to User later, a blacklist can.
const USER_SELECT = {
  id: true,
  username: true,
  nombre: true,
  apellido: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true } },
};

const DUPLICATE_USERNAME_ERROR = 'El nombre de usuario ya existe.';

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({ select: USER_SELECT });
  }

  async create(dto: CreateUserDto, creadoPorId: number) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException(DUPLICATE_USERNAME_ERROR);
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          passwordHash,
          nombre: dto.nombre,
          apellido: dto.apellido,
          rol: dto.rol,
          activo: dto.activo,
          creadoPorId,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      // The findUnique check above isn't atomic with this create — two
      // concurrent requests for the same username can both pass it. The DB's
      // unique constraint is the real backstop; translate its violation into
      // the same 409 the pre-check produces, instead of an unhandled 500.
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_USERNAME_ERROR);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateUserDto, callerId: number) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    // No role/permission system exists yet (deferred to a future "Permisos"
    // feature — see openspec/changes/user-status-creator-roles/proposal.md),
    // so any authenticated user can otherwise edit any other user. `activo`
    // is different: it's a lockout switch, not just a data field. These two
    // guards are deliberately narrow (not a general authz system) — they
    // only prevent the two ways this specific field could take down the
    // whole system: a user locking themselves out, or anyone locking out
    // the master account.
    if (dto.activo === false) {
      if (id === callerId) {
        throw new ForbiddenException('No podés desactivar tu propia cuenta.');
      }
      if (existing.username === MASTER_USERNAME) {
        throw new ForbiddenException('No se puede desactivar al usuario maestro.');
      }
    }

    const data: {
      nombre?: string;
      apellido?: string;
      rol?: string;
      activo?: boolean;
      passwordHash?: string;
    } = {
      nombre: dto.nombre,
      apellido: dto.apellido,
      rol: dto.rol,
      activo: dto.activo,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }
}
