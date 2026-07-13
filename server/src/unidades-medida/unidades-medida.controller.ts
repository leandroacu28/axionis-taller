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
import { CreateUnidadMedidaDto } from './dto/create-unidad-medida.dto';
import { UpdateUnidadMedidaDto } from './dto/update-unidad-medida.dto';
import { ListUnidadesMedidaQueryDto } from './dto/list-unidades-medida-query.dto';
import { UnidadesMedidaService } from './unidades-medida.service';

@Controller('unidades-medida')
@UseGuards(JwtAuthGuard)
export class UnidadesMedidaController {
  constructor(private readonly unidadesMedidaService: UnidadesMedidaService) {}

  @Get()
  async findAll(@Query() query: ListUnidadesMedidaQueryDto) {
    return this.unidadesMedidaService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.unidadesMedidaService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateUnidadMedidaDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.unidadesMedidaService.create(dto, req.user.userId);
  }

  // This route MUST inject @Request() and pass req.user.userId as update()'s
  // third argument — UnidadMedida carries an actualizadoPor relation like
  // TipoServicio.
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnidadMedidaDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.unidadesMedidaService.update(id, dto, req.user.userId);
  }
}
