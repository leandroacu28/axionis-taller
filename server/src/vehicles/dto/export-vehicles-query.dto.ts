import { IsIn, IsOptional, IsString } from 'class-validator';
import { VehicleStatusFilter } from './list-vehicles-query.dto';

export class ExportVehiclesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: VehicleStatusFilter = 'all';
}
