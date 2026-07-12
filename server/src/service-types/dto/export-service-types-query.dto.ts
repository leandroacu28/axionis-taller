import { IsIn, IsOptional, IsString } from 'class-validator';
import { ServiceTypeStatusFilter } from './list-service-types-query.dto';

export class ExportServiceTypesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: ServiceTypeStatusFilter = 'all';
}
