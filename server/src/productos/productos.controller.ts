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
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { ListProductosQueryDto } from './dto/list-productos-query.dto';
import { ProductosService } from './productos.service';

@Controller('productos')
@UseGuards(JwtAuthGuard)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  async findAll(@Query() query: ListProductosQueryDto) {
    return this.productosService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateProductoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.productosService.create(dto, req.user.userId);
  }

  // This route MUST inject @Request() and pass req.user.userId as update()'s
  // third argument — Producto carries an actualizadoPor relation like
  // UnidadMedida/TipoServicio.
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductoDto,
    @Request() req: { user: { userId: number; username: string } }
  ) {
    return this.productosService.update(id, dto, req.user.userId);
  }
}
