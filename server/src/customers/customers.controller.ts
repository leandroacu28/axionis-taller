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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { ExportCustomersQueryDto } from './dto/export-customers-query.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Query() query: ListCustomersQueryDto) {
    return this.customersService.findAll(query);
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
  @Header('Content-Disposition', 'attachment; filename="clientes.xlsx"')
  async export(@Query() query: ExportCustomersQueryDto): Promise<StreamableFile> {
    const buffer = await this.customersService.exportToExcel(query);
    return new StreamableFile(buffer);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateCustomerDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.customersService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @Request() req: { user: { userId: number; username: string } },
  ) {
    return this.customersService.update(id, dto, req.user.userId);
  }
}
