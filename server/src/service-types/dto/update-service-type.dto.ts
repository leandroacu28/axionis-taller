import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Same shape as CreateServiceTypeDto — mirrors update-color.dto.ts's approach
// of repeating the full field set rather than extending PartialType.
export class UpdateServiceTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
