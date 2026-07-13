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
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';
import { ExportBrandsQueryDto } from './dto/export-brands-query.dto';
import { BrandsService } from './brands.service';

@Controller('brands')
@UseGuards(JwtAuthGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  async findAll(@Query() query: ListBrandsQueryDto) {
    return this.brandsService.findAll(query);
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
  @Header('Content-Disposition', 'attachment; filename="marcas.xlsx"')
  async export(@Query() query: ExportBrandsQueryDto): Promise<StreamableFile> {
    const buffer = await this.brandsService.exportToExcel(query);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateBrandDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.brandsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBrandDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.brandsService.update(id, dto, req.user.userId);
  }
}
