import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Same shape as CreateDiagnosticoDto — mirrors update-customer.dto.ts's approach of
// repeating the full field set rather than extending PartialType.
export class UpdateDiagnosticoDto {
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
