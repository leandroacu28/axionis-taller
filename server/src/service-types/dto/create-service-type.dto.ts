import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateServiceTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
