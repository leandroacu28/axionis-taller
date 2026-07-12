import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export type ServiceTypeStatusFilter = 'all' | 'activo' | 'inactivo';

export class ListServiceTypesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: ServiceTypeStatusFilter = 'all';
}
