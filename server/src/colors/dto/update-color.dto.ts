import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Same shape as CreateColorDto — mirrors update-customer.dto.ts's approach of
// repeating the full field set rather than extending PartialType.
export class UpdateColorDto {
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
