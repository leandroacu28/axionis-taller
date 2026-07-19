import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsPatenteValida } from './patente.validator';

const MAX_ANIO = new Date().getFullYear() + 1;

export class CreateVehicleDto {
  @IsInt()
  marcaId: number;

  @IsInt()
  colorId: number;

  @IsInt()
  @Min(1900)
  @Max(MAX_ANIO)
  anio: number;

  @IsInt()
  @Min(0)
  kilometraje: number;

  @IsInt()
  clienteId: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @IsPatenteValida()
  patente?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
