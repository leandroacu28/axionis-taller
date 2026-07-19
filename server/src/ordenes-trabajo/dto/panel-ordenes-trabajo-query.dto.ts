import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches } from 'class-validator';
import { Estado, Prioridad } from '@prisma/client';
import { EstadoFilter, PrioridadFilter } from './list-ordenes-trabajo-query.dto';

// Date-only params (yyyy-mm-dd). A strict date-only shape is required so the
// service can safely append 'T00:00:00.000Z' to build UTC day boundaries
// (see dateRange() in ordenes-trabajo.service.ts). @IsDateString() would also
// accept full ISO datetimes, which would break that concatenation — hence the
// explicit regex.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class PanelOrdenesTrabajoQueryDto {
  @IsOptional()
  @IsIn(['all', ...Object.values(Estado)])
  estado?: EstadoFilter = 'all';

  // A mecánico is just any active User (D6) — no separate role check here.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mecanicoId?: number;

  @IsOptional()
  @IsIn(['all', ...Object.values(Prioridad)])
  prioridad?: PrioridadFilter = 'all';

  // Resolved date window on fechaIngreso, inclusive calendar days. Both-or-
  // neither (enforced in the service). Absent → unbounded date range
  // (defensive default; the client always sends a resolved range, so this
  // only triggers on a raw call).
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'fechaDesde debe tener formato yyyy-mm-dd' })
  fechaDesde?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'fechaHasta debe tener formato yyyy-mm-dd' })
  fechaHasta?: string;

  // The client's LOCAL calendar "today", used only for the "órdenes del día"
  // sub-count. The client owns what day "today" is (its timezone), never the
  // server (see ADR-3 in design.md). Absent → delDia is 0.
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'hoy debe tener formato yyyy-mm-dd' })
  hoy?: string;
}
