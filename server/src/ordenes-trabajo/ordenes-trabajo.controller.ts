import {
  Body,
  Controller,
  Delete,
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
import { CreateOrdenTrabajoProductoDto } from './dto/create-orden-trabajo-producto.dto';
import { UpdateOrdenTrabajoProductoDto } from './dto/update-orden-trabajo-producto.dto';
import { ListOrdenesTrabajoQueryDto } from './dto/list-ordenes-trabajo-query.dto';
import { PanelOrdenesTrabajoQueryDto } from './dto/panel-ordenes-trabajo-query.dto';
import { OrdenesTrabajoService } from './ordenes-trabajo.service';

@Controller('ordenes-trabajo')
@UseGuards(JwtAuthGuard)
export class OrdenesTrabajoController {
  constructor(private readonly ordenesTrabajoService: OrdenesTrabajoService) {}

  @Get()
  async findAll(@Query() query: ListOrdenesTrabajoQueryDto) {
    return this.ordenesTrabajoService.findAll(query);
  }

  // Literal route — must precede `:id` (below) or a request to
  // /ordenes-trabajo/panel would be captured by findOne, handing the literal
  // string "panel" to ParseIntPipe and producing a broken 400. Same
  // literal-before-param discipline as service-types.controller.ts's
  // @Get('export') before its own `:id`.
  @Get('panel')
  async panel(@Query() query: PanelOrdenesTrabajoQueryDto) {
    return this.ordenesTrabajoService.panel(query);
  }

  // Two-segment literal route, no params — an always-unfiltered global
  // snapshot (design.md §1.1/§1.2/ADR-1). Placed next to `panel` purely for
  // readability; it cannot collide with `:id` regardless of order (single-
  // segment param route can never match a two-segment request).
  @Get('panel/mecanicos')
  async panelMecanicos() {
    return this.ordenesTrabajoService.panelMecanicos();
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

  @Post(':id/detalles/:detalleId/productos')
  async addDetalleProducto(
    @Param('id', ParseIntPipe) id: number,
    @Param('detalleId', ParseIntPipe) detalleId: number,
    @Body() dto: CreateOrdenTrabajoProductoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.ordenesTrabajoService.addDetalleProducto(id, detalleId, dto, req.user.userId);
  }

  @Patch(':id/detalles/:detalleId/productos/:lineaId')
  async updateDetalleProducto(
    @Param('id', ParseIntPipe) id: number,
    @Param('detalleId', ParseIntPipe) detalleId: number,
    @Param('lineaId', ParseIntPipe) lineaId: number,
    @Body() dto: UpdateOrdenTrabajoProductoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.ordenesTrabajoService.updateDetalleProducto(id, detalleId, lineaId, dto, req.user.userId);
  }

  @Delete(':id/detalles/:detalleId/productos/:lineaId')
  @HttpCode(204)
  async removeDetalleProducto(
    @Param('id', ParseIntPipe) id: number,
    @Param('detalleId', ParseIntPipe) detalleId: number,
    @Param('lineaId', ParseIntPipe) lineaId: number
  ) {
    return this.ordenesTrabajoService.removeDetalleProducto(id, detalleId, lineaId);
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
