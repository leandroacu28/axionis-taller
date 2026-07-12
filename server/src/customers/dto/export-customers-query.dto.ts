import { IsIn, IsOptional, IsString } from 'class-validator';
import { CustomerStatusFilter } from './list-customers-query.dto';

export class ExportCustomersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: CustomerStatusFilter = 'all';
}
