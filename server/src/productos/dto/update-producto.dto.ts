import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Same shape as CreateProductoDto plus optional activo — mirrors
// unidades-medida.service.ts's repeat-fields approach rather than
// extending PartialType.
export class UpdateProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  descripcion: string;

  @IsInt()
  unidadMedidaId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  cantidadInicial: number;

  @IsBoolean()
  alertaStock: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  cantidadMinima: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  precioCompra: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  porcentajeGanancia: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  precioMayorista: number;

  @IsIn([21, 10.5])
  alicuotaIva: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
