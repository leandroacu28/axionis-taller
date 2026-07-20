import * as path from 'path';
import { unlink } from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { EMPRESA_LOGO_DIR } from './empresa.multer.config';

const EMPRESA_ID = 1;

const EMPRESA_SELECT = {
  id: true,
  nombre: true,
  direccion: true,
  telefono: true,
  logoUrl: true,
};

const DEFAULT_EMPRESA = {
  id: EMPRESA_ID,
  nombre: null,
  direccion: null,
  telefono: null,
  logoUrl: null,
};

// Swallows ENOENT — the logo file may already be gone (e.g. deleted outside
// the app, or a stale logoUrl left over from a previous failed request), and
// that's not a reason to fail the update.
async function deleteLogoFile(logoUrl: string | null): Promise<void> {
  if (!logoUrl) return;
  const filePath = path.join(EMPRESA_LOGO_DIR, path.basename(logoUrl));
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

@Injectable()
export class EmpresaService {
  constructor(private readonly prisma: PrismaService) {}

  // Empresa is a singleton config record (id always 1) — findUnique returns
  // null before the first save, and that's expected, not an error state.
  async findOne() {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: EMPRESA_ID },
      select: EMPRESA_SELECT,
    });
    return empresa ?? DEFAULT_EMPRESA;
  }

  async update(dto: UpdateEmpresaDto, logoFile: Express.Multer.File | undefined, actualizadoPorId: number) {
    const existing = await this.prisma.empresa.findUnique({ where: { id: EMPRESA_ID } });

    let logoUrl = existing?.logoUrl ?? null;
    if (logoFile) {
      await deleteLogoFile(existing?.logoUrl ?? null);
      logoUrl = `/uploads/empresa/${logoFile.filename}`;
    } else if (dto.removeLogo === true) {
      await deleteLogoFile(existing?.logoUrl ?? null);
      logoUrl = null;
    }

    return this.prisma.empresa.upsert({
      where: { id: EMPRESA_ID },
      create: {
        id: EMPRESA_ID,
        nombre: dto.nombre,
        direccion: dto.direccion,
        telefono: dto.telefono,
        logoUrl,
        actualizadoPorId,
      },
      update: {
        nombre: dto.nombre,
        direccion: dto.direccion,
        telefono: dto.telefono,
        logoUrl,
        actualizadoPorId,
      },
      select: EMPRESA_SELECT,
    });
  }
}
