import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Estado, Prioridad } from '@prisma/client';

// Same field set as CreateOrdenServicioDto — house pattern, no PartialType.
// Neither DTO carries numero, creadoPorId, or actualizadoPorId.
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
}
