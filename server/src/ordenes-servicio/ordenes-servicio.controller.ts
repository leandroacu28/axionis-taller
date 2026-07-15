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
import { CreateOrdenServicioDto } from './dto/create-orden-servicio.dto';
import { UpdateOrdenServicioDto } from './dto/update-orden-servicio.dto';
import { ListOrdenesServicioQueryDto } from './dto/list-ordenes-servicio-query.dto';
import { OrdenesServicioService } from './ordenes-servicio.service';

@Controller('ordenes-servicio')
@UseGuards(JwtAuthGuard)
export class OrdenesServicioController {
  constructor(private readonly ordenesServicioService: OrdenesServicioService) {}

  @Get()
  async findAll(@Query() query: ListOrdenesServicioQueryDto) {
    return this.ordenesServicioService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesServicioService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateOrdenServicioDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.ordenesServicioService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrdenServicioDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.ordenesServicioService.update(id, dto, req.user.userId);
  }
}
