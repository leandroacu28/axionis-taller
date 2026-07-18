import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CreateOrdenTrabajoProductoDto {
  @IsInt()
  productoId: number;

  // Mirrors create-producto.dto.ts's Decimal-backed money/qty fields, but
  // strictly positive: a zero-quantity consumed line is meaningless.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  cantidad: number;
}
