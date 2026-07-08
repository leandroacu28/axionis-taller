import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  username: true,
  nombre: true,
  apellido: true,
  rol: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({ select: USER_SELECT });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('El nombre de usuario ya existe.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        nombre: dto.nombre,
        apellido: dto.apellido,
        rol: dto.rol,
      },
      select: USER_SELECT,
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const data: {
      nombre?: string;
      apellido?: string;
      rol?: string;
      passwordHash?: string;
    } = {
      nombre: dto.nombre,
      apellido: dto.apellido,
      rol: dto.rol,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }
}
