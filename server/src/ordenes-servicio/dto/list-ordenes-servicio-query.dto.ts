import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type EstadoFilter = 'all' | 'pendiente' | 'en_proceso' | 'terminado';

export class ListOrdenesServicioQueryDto {
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

  // Matches numero, cliente.razonSocial, and marca.marca/modelo via OR/contains.
  @IsOptional()
  @IsString()
  search?: string;

  // Replaces the catalog-style activo filter (D2) — counts are reframed
  // per-estado rather than active/inactive.
  @IsOptional()
  @IsIn(['all', 'pendiente', 'en_proceso', 'terminado'])
  estado?: EstadoFilter = 'all';
}
