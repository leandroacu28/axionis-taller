import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ID_TYPE_PATTERNS, IdType } from '../customer.constants';

@ValidatorConstraint({ name: 'identificacionValida', async: false })
export class IdentificacionValidaConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const tipo = (args.object as { tipoIdentificacion?: string }).tipoIdentificacion as IdType;
    const pattern = ID_TYPE_PATTERNS[tipo];
    if (!pattern) return false; // unknown/absent tipo — @IsIn already reports it separately
    return typeof value === 'string' && pattern.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const tipo = (args.object as { tipoIdentificacion?: string }).tipoIdentificacion;
    if (tipo === 'dni') return 'El DNI debe tener 7 u 8 dígitos.';
    if (tipo === 'cuit' || tipo === 'cuil') return 'El CUIT/CUIL debe tener 11 dígitos.';
    return 'Identificación inválida.';
  }
}

export function IsIdentificacionValida(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'identificacionValida',
      target: object.constructor,
      propertyName,
      options,
      validator: IdentificacionValidaConstraint,
    });
  };
}
