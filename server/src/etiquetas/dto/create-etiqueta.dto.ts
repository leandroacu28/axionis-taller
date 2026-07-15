import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEtiquetaDto {
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
