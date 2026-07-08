import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsIn(['admin', 'empleado'])
  rol?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;
}
