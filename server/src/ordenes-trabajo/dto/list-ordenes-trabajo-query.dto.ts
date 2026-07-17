import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Estado, Prioridad } from '@prisma/client';

export type EstadoFilter = 'all' | 'pendiente' | 'en_proceso' | 'terminado' | 'cancelado';

// Orthogonal to EstadoFilter — mirrors ListEtiquetasQueryDto's status filter.
// activo is a soft-deactivation flag, independent of the estado lifecycle.
export type OrdenTrabajoStatusFilter = 'all' | 'activo' | 'inactivo';

export type PrioridadFilter = 'all' | 'normal' | 'alta' | 'urgente';

export class ListOrdenesTrabajoQueryDto {
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
  @IsIn(['all', ...Object.values(Estado)])
  estado?: EstadoFilter = 'all';

  // Additive on top of `estado` — activo is an orthogonal soft-deactivation
  // flag, not a replacement for the estado lifecycle. Mirrors
  // ListEtiquetasQueryDto's status filter.
  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: OrdenTrabajoStatusFilter = 'all';

  // A mecánico is just any active User (D6) — no separate role check here,
  // findOne/create/update already validate the id via ensureMecanicoExists.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mecanicoId?: number;

  @IsOptional()
  @IsIn(['all', ...Object.values(Prioridad)])
  prioridad?: PrioridadFilter = 'all';
}
