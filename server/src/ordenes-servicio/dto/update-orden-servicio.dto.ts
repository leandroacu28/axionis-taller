import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Estado, Prioridad } from '@prisma/client';

// Same field set as CreateOrdenServicioDto — house pattern, no PartialType —
// plus optional `activo`, update-only (mirrors UpdateProductoDto). Neither
// DTO carries numero, creadoPorId, or actualizadoPorId.
export class UpdateOrdenServicioDto {
  @IsOptional()
  @IsDateString()
  fechaIngreso?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  kilometros: number;

  @IsOptional()
  @IsIn(Object.values(Prioridad))
  prioridad?: Prioridad;

  @IsString()
  @IsNotEmpty()
  motivoIngreso: string;

  @IsOptional()
  @IsIn(Object.values(Estado))
  estado?: Estado;

  @Type(() => Number)
  @IsInt()
  clienteId: number;

  @Type(() => Number)
  @IsInt()
  vehiculoId: number;

  @Type(() => Number)
  @IsInt()
  mecanicoId: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  tipoServicioIds: number[];

  // Optional, no default-value literal — a default literal here would let
  // class-transformer's plainToInstance + ValidationPipe({ transform: true })
  // silently reset activo on every PATCH that omits it (the same bug class
  // already fixed once on estado/prioridad in this DTO). undefined here
  // means "leave unchanged" in the service's update().
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
