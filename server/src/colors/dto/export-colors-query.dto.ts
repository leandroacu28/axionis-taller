import { IsIn, IsOptional, IsString } from 'class-validator';
import { ColorStatusFilter } from './list-colors-query.dto';

export class ExportColorsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: ColorStatusFilter = 'all';
}
