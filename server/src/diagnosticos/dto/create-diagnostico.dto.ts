import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDiagnosticoDto {
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
