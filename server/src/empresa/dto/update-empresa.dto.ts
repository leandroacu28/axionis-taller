import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateEmpresaDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  // Multipart fields always arrive as strings — 'true'/'false' — so this
  // coerces the wire value before @IsBoolean() validates it, same reason
  // update-color.dto.ts's `activo` uses plain @IsBoolean() over JSON but
  // this endpoint is multipart-only.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  removeLogo?: boolean;
}
