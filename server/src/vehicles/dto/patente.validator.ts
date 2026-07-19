import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Old Argentine format: 3 letters + 3 digits (e.g. ABC123).
const PATENTE_VIEJA = /^[A-Z]{3}\d{3}$/;
// Mercosur format: 2 letters + 3 digits + 2 letters (e.g. AB123CD).
const PATENTE_MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

@ValidatorConstraint({ name: 'patenteValida', async: false })
export class PatenteValidaConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // patente is optional — an absent value is valid; only a provided value
    // must match one of the two accepted formats. The DTO's @Transform has
    // already uppercased + trimmed by the time this runs, so we match against
    // the canonical form only.
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    return PATENTE_VIEJA.test(value) || PATENTE_MERCOSUR.test(value);
  }

  defaultMessage(): string {
    return 'La patente debe tener formato ABC123 o AB123CD.';
  }
}

export function IsPatenteValida(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'patenteValida',
      target: object.constructor,
      propertyName,
      options,
      validator: PatenteValidaConstraint,
    });
  };
}
