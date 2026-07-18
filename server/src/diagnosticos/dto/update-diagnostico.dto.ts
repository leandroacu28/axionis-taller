import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Same shape as CreateDiagnosticoDto — mirrors update-customer.dto.ts's approach of
// repeating the full field set rather than extending PartialType.
export class UpdateDiagnosticoDto {
  @Transform(({ value }) =>
    typeof value === 'string' && value.length > 0
      ? value.charAt(0).toUpperCase() + value.slice(1)
      : value,
  )
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
