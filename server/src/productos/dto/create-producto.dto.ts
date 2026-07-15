import {
  IsArray,
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
  ValidateIf,
} from 'class-validator';

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  descripcion: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  codigo?: string | null;

  @IsInt()
  unidadMedidaId: number;

  // Optional — the service defaults it to 0 when omitted.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  cantidadInicial?: number;

  @IsBoolean()
  alertaStock: boolean;

  // Required only when alertaStock is true; the service defaults it to 0
  // otherwise (the field is locked/hidden client-side in that case).
  @ValidateIf((dto) => dto.alertaStock === true)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  cantidadMinima?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  precioCompra?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  porcentajeGanancia?: number | null;

  // Required — the client auto-fills it from precioCompra +
  // porcentajeGanancia when both are present, but the user can also type it
  // manually; either way a value must reach the server.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  precioVenta: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  precioMayorista?: number | null;

  @IsIn([21, 10.5, 0])
  alicuotaIva: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  etiquetaIds?: number[];
}
