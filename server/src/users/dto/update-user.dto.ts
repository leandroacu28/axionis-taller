import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { USER_ROLES, UserRol } from '../user.constants';

// NOTE: no `username` field here, deliberately — this is how username
// immutability is enforced. The global ValidationPipe({ whitelist: true })
// in main.ts silently strips any `username` sent in a PATCH body. Do not
// add one back without updating the users-management spec.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  rol?: UserRol;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
