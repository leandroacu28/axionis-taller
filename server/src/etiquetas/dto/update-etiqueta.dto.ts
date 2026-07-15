import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Same shape as CreateEtiquetaDto — mirrors update-color.dto.ts's approach of
// repeating the full field set rather than extending PartialType.
export class UpdateEtiquetaDto {
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
