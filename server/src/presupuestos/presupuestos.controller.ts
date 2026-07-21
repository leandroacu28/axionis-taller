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
import { CreatePresupuestoDto } from './dto/create-presupuesto.dto';
import { UpdatePresupuestoDto } from './dto/update-presupuesto.dto';
import { CreatePresupuestoProductoDto } from './dto/create-presupuesto-producto.dto';
import { ListPresupuestosQueryDto } from './dto/list-presupuestos-query.dto';
import { PresupuestosService } from './presupuestos.service';

@Controller('presupuestos')
@UseGuards(JwtAuthGuard)
export class PresupuestosController {
  constructor(private readonly presupuestosService: PresupuestosService) {}

  @Get()
  async findAll(@Query() query: ListPresupuestosQueryDto) {
    return this.presupuestosService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.presupuestosService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreatePresupuestoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.presupuestosService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePresupuestoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.presupuestosService.update(id, dto, req.user.userId);
  }

  // ---- Line-item sub-routes (flattened OT trio; no :detalleId join level,
  // per design.md Decision A2 — a presupuesto has a single tipoServicio, so
  // lines hang directly off it). No DELETE /presupuestos/:id anywhere in
  // this controller (D3) — the only delete-shaped route removes a line item.

  @Post(':id/productos')
  async addProducto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePresupuestoProductoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.presupuestosService.addProducto(id, dto, req.user.userId);
  }

  @Patch(':id/productos/:detalleId')
  async updateProducto(
    @Param('id', ParseIntPipe) id: number,
    @Param('detalleId', ParseIntPipe) detalleId: number,
    @Body() dto: CreatePresupuestoProductoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.presupuestosService.updateProducto(id, detalleId, dto, req.user.userId);
  }

  // No actualizadoPorId param — the row is gone, nowhere to stamp it (OT
  // precedent at ordenes-trabajo.service.ts:778-785).
  @Delete(':id/productos/:detalleId')
  @HttpCode(204)
  async removeProducto(
    @Param('id', ParseIntPipe) id: number,
    @Param('detalleId', ParseIntPipe) detalleId: number
  ) {
    return this.presupuestosService.removeProducto(id, detalleId);
  }
}
