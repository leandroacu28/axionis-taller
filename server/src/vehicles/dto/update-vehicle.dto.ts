import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_ANIO = new Date().getFullYear() + 1;

// Same shape as CreateVehicleDto — mirrors update-color.dto.ts's approach of
// repeating the full field set rather than extending PartialType.
export class UpdateVehicleDto {
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
