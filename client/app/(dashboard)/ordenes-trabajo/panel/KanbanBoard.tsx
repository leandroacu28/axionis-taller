import type { Estado, OrdenTrabajoListItem } from '../../../lib/ordenes-trabajo';
import { KanbanColumn, COLUMNS } from './KanbanColumn';
import KanbanMobileTabs from './KanbanMobileTabs';

interface KanbanBoardProps {
  data: OrdenTrabajoListItem[];
  meta: { total: number; cap: number; capped: boolean };
  onActionSuccess: () => void;
}

export default function KanbanBoard({ data, meta, onActionSuccess }: KanbanBoardProps) {
  // Group ONCE; feed both trees (static column order so empty estados still show).
  const columns = COLUMNS.map((estado) => ({
    estado,
    ordenes: data.filter((orden) => orden.estado === estado),
  }));

  return (
    <div className="mt-6">
      {meta.capped && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Mostrando las primeras {meta.cap} de {meta.total} órdenes. Ajustá los filtros para acotar.
        </div>
      )}

      {/* Desktop tree: CSS-hidden below lg. 4-column grid → no horizontal scroll (§5.5). */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-4">
        {columns.map(({ estado, ordenes }) => (
          <KanbanColumn key={estado} estado={estado} ordenes={ordenes} onActionSuccess={onActionSuccess} />
        ))}
      </div>

      {/* Mobile tree: CSS-hidden at lg+. Tab switcher, one column at a time. */}
      <div className="lg:hidden">
        <KanbanMobileTabs columns={columns} onActionSuccess={onActionSuccess} />
      </div>
    </div>
  );
}
