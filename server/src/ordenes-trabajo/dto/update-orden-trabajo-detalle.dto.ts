import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Estado } from '@prisma/client';

// All fields optional/partial-update — the frontend "Iniciar trabajo" page
// sends only the fields that changed on a given card, or the full set;
// either way each field must be independently nullable/omittable since a
// mechanic may clear a diagnóstico or dates.
export class UpdateOrdenTrabajoDetalleDto {
  @IsOptional()
  @IsIn(Object.values(Estado))
  estado?: Estado;

  @IsOptional()
  @IsInt()
  diagnosticoId?: number | null;

  @IsOptional()
  @IsString()
  trabajoRealizado?: string | null;

  @IsOptional()
  @IsDateString()
  proximoServiceFecha?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  proximoServiceKm?: number | null;

  @IsOptional()
  @IsDateString()
  fechaFinalizacion?: string | null;
}
