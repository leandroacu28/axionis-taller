import { IsIn, IsOptional, IsString } from 'class-validator';
import { BrandStatusFilter } from './list-brands-query.dto';

export class ExportBrandsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: BrandStatusFilter = 'all';
}
