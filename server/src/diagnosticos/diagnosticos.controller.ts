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
import { CreateDiagnosticoDto } from './dto/create-diagnostico.dto';
import { UpdateDiagnosticoDto } from './dto/update-diagnostico.dto';
import { ListDiagnosticosQueryDto } from './dto/list-diagnosticos-query.dto';
import { DiagnosticosService } from './diagnosticos.service';

@Controller('diagnosticos')
@UseGuards(JwtAuthGuard)
export class DiagnosticosController {
  constructor(private readonly diagnosticosService: DiagnosticosService) {}

  @Get()
  async findAll(@Query() query: ListDiagnosticosQueryDto) {
    return this.diagnosticosService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.diagnosticosService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateDiagnosticoDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.diagnosticosService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDiagnosticoDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.diagnosticosService.update(id, dto, req.user.userId);
  }
}
