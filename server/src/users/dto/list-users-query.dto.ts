import { IsIn, IsOptional, IsString } from 'class-validator';

export type UserStatusFilter = 'all' | 'activo' | 'inactivo';

// Mirrors ListEtiquetasQueryDto's search/status shape, but deliberately
// without page/pageSize — this endpoint stays a plain unpaginated array
// response (the mecánico picker wants a bounded searchable list, not pages).
export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: UserStatusFilter = 'all';
}
