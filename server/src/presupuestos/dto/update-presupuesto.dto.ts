import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString } from 'class-validator';

// FULL body (D5), no `productos` field — line items are edited via the
// dedicated sub-routes, never through this endpoint.
export class UpdatePresupuestoDto {
  @IsISO8601()
  fecha: string;

  @IsInt()
  clienteId: number;

  @IsInt()
  tipoServicioId: number;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
