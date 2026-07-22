import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type PresupuestoStatusFilter = 'all' | 'activo' | 'inactivo';
export type PresupuestoSortBy = 'id' | 'fecha';
export type SortDirection = 'asc' | 'desc';

export class ListPresupuestosQueryDto {
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
  status?: PresupuestoStatusFilter = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tipoServicioId?: number;

  @IsOptional()
  @IsIn(['id', 'fecha'])
  sortBy?: PresupuestoSortBy = 'id';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: SortDirection = 'desc';
}
