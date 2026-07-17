import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrdenTrabajoDto } from './dto/create-orden-trabajo.dto';
import { UpdateOrdenTrabajoDto } from './dto/update-orden-trabajo.dto';
import { UpdateOrdenTrabajoDetalleDto } from './dto/update-orden-trabajo-detalle.dto';
import { ListOrdenesTrabajoQueryDto } from './dto/list-ordenes-trabajo-query.dto';
import { OrdenesTrabajoService } from './ordenes-trabajo.service';

@Controller('ordenes-trabajo')
@UseGuards(JwtAuthGuard)
export class OrdenesTrabajoController {
  constructor(private readonly ordenesTrabajoService: OrdenesTrabajoService) {}

  @Get()
  async findAll(@Query() query: ListOrdenesTrabajoQueryDto) {
    return this.ordenesTrabajoService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesTrabajoService.findOne(id);
  }

  @Get(':id/detalles')
  async findDetalles(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesTrabajoService.findDetalles(id);
  }

  @Patch(':id/detalles/:detalleId')
  async updateDetalle(
    @Param('id', ParseIntPipe) id: number,
    @Param('detalleId', ParseIntPipe) detalleId: number,
    @Body() dto: UpdateOrdenTrabajoDetalleDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.ordenesTrabajoService.updateDetalle(id, detalleId, dto, req.user.userId);
  }

  @Post()
  async create(
    @Body() dto: CreateOrdenTrabajoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.ordenesTrabajoService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrdenTrabajoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.ordenesTrabajoService.update(id, dto, req.user.userId);
  }

  // spec.md's scenarios require 200 (not Nest's default 201 for @Post) since
  // this returns the already-existing order in its updated state, not a
  // newly-created resource.
  @Post(':id/iniciar')
  @HttpCode(200)
  async iniciar(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.ordenesTrabajoService.iniciar(id, req.user.userId);
  }
}
