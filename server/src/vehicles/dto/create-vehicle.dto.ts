import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
