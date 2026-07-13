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
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import { ExportVehiclesQueryDto } from './dto/export-vehicles-query.dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async findAll(@Query() query: ListVehiclesQueryDto) {
    return this.vehiclesService.findAll(query);
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
  @Header('Content-Disposition', 'attachment; filename="vehiculos.xlsx"')
  async export(@Query() query: ExportVehiclesQueryDto): Promise<StreamableFile> {
    const buffer = await this.vehiclesService.exportToExcel(query);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vehiclesService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateVehicleDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.vehiclesService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.vehiclesService.update(id, dto, req.user.userId);
  }
}
