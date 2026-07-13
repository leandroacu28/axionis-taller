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
import { CreateColorDto } from './dto/create-color.dto';
import { UpdateColorDto } from './dto/update-color.dto';
import { ListColorsQueryDto } from './dto/list-colors-query.dto';
import { ExportColorsQueryDto } from './dto/export-colors-query.dto';
import { ColorsService } from './colors.service';

@Controller('colors')
@UseGuards(JwtAuthGuard)
export class ColorsController {
  constructor(private readonly colorsService: ColorsService) {}

  @Get()
  async findAll(@Query() query: ListColorsQueryDto) {
    return this.colorsService.findAll(query);
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
  @Header('Content-Disposition', 'attachment; filename="colores.xlsx"')
  async export(@Query() query: ExportColorsQueryDto): Promise<StreamableFile> {
    const buffer = await this.colorsService.exportToExcel(query);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.colorsService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateColorDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.colorsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateColorDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.colorsService.update(id, dto, req.user.userId);
  }
}
