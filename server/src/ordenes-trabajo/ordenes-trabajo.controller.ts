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
import { CreateOrdenTrabajoDto } from './dto/create-orden-trabajo.dto';
import { UpdateOrdenTrabajoDto } from './dto/update-orden-trabajo.dto';
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
}
