import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEtiquetaDto } from './dto/create-etiqueta.dto';
import { UpdateEtiquetaDto } from './dto/update-etiqueta.dto';
import { ListEtiquetasQueryDto } from './dto/list-etiquetas-query.dto';
import { EtiquetasService } from './etiquetas.service';

@Controller('etiquetas')
@UseGuards(JwtAuthGuard)
export class EtiquetasController {
  constructor(private readonly etiquetasService: EtiquetasService) {}

  @Get()
  async findAll(@Query() query: ListEtiquetasQueryDto) {
    return this.etiquetasService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.etiquetasService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateEtiquetaDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.etiquetasService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEtiquetaDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.etiquetasService.update(id, dto, req.user.userId);
  }
}
