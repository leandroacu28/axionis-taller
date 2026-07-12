import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Same shape as CreateBrandDto — mirrors update-color.dto.ts's approach of
// repeating the full field set rather than extending PartialType.
export class UpdateBrandDto {
  @IsString()
  @IsNotEmpty()
  marca: string;

  @IsString()
  @IsNotEmpty()
  modelo: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
