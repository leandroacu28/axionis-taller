import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ID_TYPES, IdType } from '../customer.constants';
import { IsIdentificacionValida } from './identificacion.validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  @IsIn(ID_TYPES)
  tipoIdentificacion: IdType;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsOptional()
  @IsString()
  @IsIdentificacionValida()
  identificacion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  domicilio?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
