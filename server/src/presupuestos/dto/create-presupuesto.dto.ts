import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreatePresupuestoProductoDto } from './create-presupuesto-producto.dto';

export class CreatePresupuestoDto {
  // Quote's own date, set by the user (distinct from createdAt). JSON
  // payload is an ISO string; the service wraps it with `new Date(dto.fecha)`.
  @IsISO8601()
  fecha: string;

  @IsInt()
  clienteId: number;

  @IsInt()
  tipoServicioId: number;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  // NO `activo` field: the spec mandates `activo` defaults to `true` and is
  // NOT client-settable on create. Mirrors CreateProductoDto (no `activo`) —
  // the Prisma schema `@default(true)` is the sole authority on create.

  // Optional initial line items — each frozen server-side at POST time.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePresupuestoProductoDto)
  productos?: CreatePresupuestoProductoDto[];
}
