import { Injectable, NotFoundException } from '@nestjs/common';
import { SectionAccessLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PutRoleGridDto } from './dto/put-role-grid.dto';
import { PutUserOverridesDto } from './dto/put-user-overrides.dto';
import { SECTION_IDS } from './section-catalog';

const NOT_FOUND_USER_ERROR = 'Usuario no encontrado.';

type EffectiveGridUser = { id: number; rol: string };

@Injectable()
export class PermisosService {
  constructor(private readonly prisma: PrismaService) {}

  async getRoleGrid(rol: string) {
    return { rol, sections: await this.buildRoleGrid(rol) };
  }

  async putRoleGrid(rol: string, dto: PutRoleGridDto) {
    await this.prisma.$transaction(
      dto.sections.map((entry) =>
        this.prisma.roleSectionAccess.upsert({
          where: { rol_sectionId: { rol, sectionId: entry.sectionId } },
          create: { rol, sectionId: entry.sectionId, level: entry.level as SectionAccessLevel },
          update: { level: entry.level as SectionAccessLevel },
        }),
      ),
    );

    return { rol, sections: await this.buildRoleGrid(rol) };
  }

  async getUserGrid(userId: number) {
    const user = await this.assertUserExists(userId);
    return { userId: user.id, rol: user.rol, sections: await this.buildEffectiveGrid(user) };
  }

  async putUserGrid(userId: number, dto: PutUserOverridesDto) {
    const user = await this.assertUserExists(userId);

    await this.prisma.$transaction(
      dto.sections.map((entry) =>
        entry.level === null
          ? this.prisma.userSectionOverride.deleteMany({
              where: { userId, sectionId: entry.sectionId },
            })
          : this.prisma.userSectionOverride.upsert({
              where: { userId_sectionId: { userId, sectionId: entry.sectionId } },
              create: { userId, sectionId: entry.sectionId, level: entry.level as SectionAccessLevel },
              update: { level: entry.level as SectionAccessLevel },
            }),
      ),
    );

    return { userId: user.id, rol: user.rol, sections: await this.buildEffectiveGrid(user) };
  }

  private async assertUserExists(userId: number): Promise<EffectiveGridUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, rol: true },
    });
    if (!user) {
      throw new NotFoundException(NOT_FOUND_USER_ERROR);
    }
    return user;
  }

  private async buildRoleGrid(rol: string) {
    const rows = await this.prisma.roleSectionAccess.findMany({ where: { rol } });
    const roleMap = new Map(rows.map((row) => [row.sectionId, row.level]));

    return SECTION_IDS.map((sectionId) => ({
      sectionId,
      level: roleMap.get(sectionId) ?? 'sin_acceso',
    }));
  }

  private async buildEffectiveGrid(user: EffectiveGridUser) {
    const [roleRows, overrideRows] = await Promise.all([
      this.prisma.roleSectionAccess.findMany({ where: { rol: user.rol } }),
      this.prisma.userSectionOverride.findMany({ where: { userId: user.id } }),
    ]);
    const roleMap = new Map(roleRows.map((row) => [row.sectionId, row.level]));
    const overrideMap = new Map(overrideRows.map((row) => [row.sectionId, row.level]));

    return SECTION_IDS.map((sectionId) => {
      const roleLevel = roleMap.get(sectionId) ?? 'sin_acceso';
      const overrideLevel = overrideMap.get(sectionId) ?? null;
      const effectiveLevel = overrideLevel ?? roleLevel;
      return { sectionId, roleLevel, overrideLevel, effectiveLevel };
    });
  }
}
