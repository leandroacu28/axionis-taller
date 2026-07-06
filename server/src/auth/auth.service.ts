import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const MASTER_USERNAME = 'lmoreno';
const MASTER_PASSWORD = 'craneo';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async initMasterUser() {
    const existing = await this.prisma.user.findUnique({ where: { username: MASTER_USERNAME } });
    if (existing) {
      throw new ConflictException('El usuario maestro ya fue inicializado.');
    }

    const passwordHash = await bcrypt.hash(MASTER_PASSWORD, 10);
    await this.prisma.user.create({
      data: {
        username: MASTER_USERNAME,
        passwordHash,
      },
    });

    return { message: 'Usuario maestro inicializado correctamente.' };
  }

  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    const { passwordHash: _passwordHash, ...result } = user;
    return result;
  }

  async login(user: { id: number; username: string }) {
    const payload = { sub: user.id, username: user.username };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
