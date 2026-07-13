import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Same shape as CreateUnidadMedidaDto — mirrors update-service-type.dto.ts's
// approach of repeating the full field set rather than extending PartialType.
export class UpdateUnidadMedidaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
