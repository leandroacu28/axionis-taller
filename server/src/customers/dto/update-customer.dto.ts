import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ID_TYPES, IdType } from '../customer.constants';
import { IsIdentificacionValida } from './identificacion.validator';

// Same shape as CreateCustomerDto — no immutable-by-omission field here;
// unlike users' username, every cliente field is editable. Mirrors the
// current update-user.dto.ts style of repeating the full field set.
export class UpdateCustomerDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  @IsIn(ID_TYPES)
  tipoIdentificacion: IdType;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @IsNotEmpty()
  @IsIdentificacionValida()
  identificacion: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @IsString()
  @IsNotEmpty()
  domicilio: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
