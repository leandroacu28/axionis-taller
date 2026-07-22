import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Verbatim mirror of create-orden-trabajo-producto.dto.ts — strictly
// positive cantidad: a zero-quantity line item is meaningless.
export class CreatePresupuestoProductoDto {
  // Optional: omitted for a custom (free-text) item. Exactly one of
  // productoId/descripcionPersonalizada must be present — enforced in the
  // service, not here.
  @IsOptional()
  @IsInt()
  productoId?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  cantidad: number;

  // Optional client-supplied override for the frozen precioUnitario on a NEW
  // line (addProductoLine); falls back to the catalog precioVenta when
  // omitted. Never written back to Producto.precioVenta. Required (enforced
  // in the service) when this is a custom item, since there is no catalog
  // price to fall back to.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  precioUnitario?: number;

  // Free-text description for a custom (non-catalog) item.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcionPersonalizada?: string;
}
