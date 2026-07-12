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
  dni: true,
  email: true,
  nombre: true,
  apellido: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true } },
};

const DUPLICATE_USERNAME_ERROR = 'El nombre de usuario ya existe.';
const DUPLICATE_DNI_ERROR = 'El DNI ya está registrado.';

// The generic isUniqueConstraintError check collapses every P2002 into one
// meaning — with two unique columns (username, dni) that would mislabel a
// DNI collision as a username collision. This target-aware version reads
// error.meta.target (the constraint/index name on MySQL, e.g. `User_dni_key`)
// so the P2002 backstop reports the field that actually collided.
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
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({ select: USER_SELECT });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    return user;
  }

  async create(dto: CreateUserDto, creadoPorId: number) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException(DUPLICATE_USERNAME_ERROR);
    }

    const existingDni = await this.prisma.user.findUnique({ where: { dni: dto.dni } });
    if (existingDni) {
      throw new ConflictException(DUPLICATE_DNI_ERROR);
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          passwordHash,
          dni: dto.dni,
          email: dto.email,
          nombre: dto.nombre,
          apellido: dto.apellido,
          rol: dto.rol,
          activo: dto.activo,
          creadoPorId,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      // The findUnique checks above aren't atomic with this create — two
      // concurrent requests for the same username/dni can both pass them.
      // The DB's unique constraints are the real backstop; translate their
      // violation into the same 409 the pre-checks produce, instead of an
      // unhandled 500.
      if (uniqueTargetIncludes(error, 'username')) {
        throw new ConflictException(DUPLICATE_USERNAME_ERROR);
      }
      if (uniqueTargetIncludes(error, 'dni')) {
        throw new ConflictException(DUPLICATE_DNI_ERROR);
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

    if (dto.username !== existing.username && existing.username === MASTER_USERNAME) {
      throw new ForbiddenException('No se puede renombrar al usuario maestro.');
    }

    // findUnique can't express NOT — username/dni ARE unique, but we must
    // allow the row being edited to keep its own value. findFirst with
    // NOT: { id } does that: "edit without changing the value" only matches
    // the row itself, which NOT excludes, while a value belonging to a
    // different user is still blocked.
    const usernameOwner = await this.prisma.user.findFirst({
      where: { username: dto.username, NOT: { id } },
    });
    if (usernameOwner) {
      throw new ConflictException(DUPLICATE_USERNAME_ERROR);
    }

    const dniOwner = await this.prisma.user.findFirst({
      where: { dni: dto.dni, NOT: { id } },
    });
    if (dniOwner) {
      throw new ConflictException(DUPLICATE_DNI_ERROR);
    }

    const data: {
      username?: string;
      dni?: string;
      email?: string;
      nombre?: string;
      apellido?: string;
      rol?: string;
      activo?: boolean;
      passwordHash?: string;
    } = {
      username: dto.username,
      dni: dto.dni,
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      rol: dto.rol,
      activo: dto.activo,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: USER_SELECT,
      });
    } catch (error) {
      // Same TOCTOU backstop as create() — the pre-check above isn't atomic
      // with this update.
      if (uniqueTargetIncludes(error, 'username')) {
        throw new ConflictException(DUPLICATE_USERNAME_ERROR);
      }
      if (uniqueTargetIncludes(error, 'dni')) {
        throw new ConflictException(DUPLICATE_DNI_ERROR);
      }
      throw error;
    }
  }
}
