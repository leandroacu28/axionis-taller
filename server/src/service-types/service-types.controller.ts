import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ListServiceTypesQueryDto } from './dto/list-service-types-query.dto';
import { ExportServiceTypesQueryDto } from './dto/export-service-types-query.dto';
import { ServiceTypesService } from './service-types.service';

@Controller('service-types')
@UseGuards(JwtAuthGuard)
export class ServiceTypesController {
  constructor(private readonly serviceTypesService: ServiceTypesService) {}

  @Get()
  async findAll(@Query() query: ListServiceTypesQueryDto) {
    return this.serviceTypesService.findAll(query);
  }

  // Must stay above @Get(':id') — NestJS/Express matches routes top-to-bottom,
  // so a literal 'export' segment declared after ':id' would be captured by
  // ':id' and rejected by ParseIntPipe (400) instead of reaching this handler.
  //
  // Wrapped in StreamableFile rather than returned as a raw Buffer: Nest's
  // Express adapter (reply() in express-adapter.js) special-cases
  // `body instanceof StreamableFile` to pipe the bytes straight to the
  // response. Anything else that is `isObject()` — and a Buffer is, since
  // `typeof buffer === 'object'` — falls through to `response.json(body)`,
  // which JSON-serializes the Buffer as `{"type":"Buffer","data":[...]}`
  // text instead of writing the binary, corrupting the .xlsx.
  @Get('export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="tipos-servicio.xlsx"')
  async export(@Query() query: ExportServiceTypesQueryDto): Promise<StreamableFile> {
    const buffer = await this.serviceTypesService.exportToExcel(query);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.serviceTypesService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateServiceTypeDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.serviceTypesService.create(dto, req.user.userId);
  }

  // Unlike colors.controller.ts's PATCH (no updater to stamp), this route
  // MUST inject @Request() and pass req.user.userId as update()'s third
  // argument — TipoServicio carries an actualizadoPor relation like Cliente.
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceTypeDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.serviceTypesService.update(id, dto, req.user.userId);
  }
}
