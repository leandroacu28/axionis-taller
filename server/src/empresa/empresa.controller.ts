import { Body, Controller, Get, Patch, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { empresaMulterOptions } from './empresa.multer.config';
import { EmpresaService } from './empresa.service';

@Controller('empresa')
@UseGuards(JwtAuthGuard)
export class EmpresaController {
  constructor(private readonly empresaService: EmpresaService) {}

  @Get()
  async findOne() {
    return this.empresaService.findOne();
  }

  @Patch()
  @UseInterceptors(FileInterceptor('logo', empresaMulterOptions))
  async update(
    @Body() dto: UpdateEmpresaDto,
    @UploadedFile() logo: Express.Multer.File,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.empresaService.update(dto, logo, req.user.userId);
  }
}
