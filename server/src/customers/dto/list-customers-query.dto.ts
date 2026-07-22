import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type CustomerStatusFilter = 'all' | 'activo' | 'inactivo';
export type SortDirection = 'asc' | 'desc';

export class ListCustomersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: CustomerStatusFilter = 'all';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: SortDirection = 'desc';
}
