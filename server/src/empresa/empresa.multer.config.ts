import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';

export const EMPRESA_LOGO_DIR = path.join(process.cwd(), 'uploads', 'empresa');

fs.mkdirSync(EMPRESA_LOGO_DIR, { recursive: true });

export const empresaMulterOptions = {
  storage: diskStorage({
    destination: EMPRESA_LOGO_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new BadRequestException('El logo debe ser un archivo de imagen.'), false);
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: parseInt(process.env.MAX_LOGO_SIZE_MB || '5', 10) * 1024 * 1024,
  },
};
