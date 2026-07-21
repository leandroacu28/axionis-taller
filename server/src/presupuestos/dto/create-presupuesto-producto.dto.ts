import { IsInt, IsNumber, Max, Min } from 'class-validator';

// Verbatim mirror of create-orden-trabajo-producto.dto.ts — strictly
// positive cantidad: a zero-quantity line item is meaningless.
export class CreatePresupuestoProductoDto {
  @IsInt()
  productoId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  cantidad: number;
}
