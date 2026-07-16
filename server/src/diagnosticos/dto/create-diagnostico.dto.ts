import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDiagnosticoDto {
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
