import type { Estado, OrdenTrabajoListItem, Prioridad } from '../../../lib/ordenes-trabajo';
import KanbanCardActions from './KanbanCardActions';

// Re-declared locally per design.md §2.3 — small presentation maps/helpers
// duplicated from the list page rather than shared, so the list page's
// imports stay untouched (D7).
export const ESTADO_LABELS: Record<Estado, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminado: 'Terminado',
  cancelado: 'Cancelado',
};

export const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const PRIORIDAD_BADGE_CLASSES: Record<Prioridad, string> = {
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  alta: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  urgente: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

function formatFecha(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function mecanicoLabel(mecanico: OrdenTrabajoListItem['mecanico']): string {
  const fullName = `${mecanico.nombre ?? ''} ${mecanico.apellido ?? ''}`.trim();
  return fullName || mecanico.username;
}

// Fixed column order (design.md §3.5 / spec's "Kanban Board Has Four Columns
// in a Fixed Order"). Static — not derived from `data` — so an empty column
// still renders with a zero count.
export const COLUMNS: Estado[] = ['pendiente', 'en_proceso', 'terminado', 'cancelado'];

// Same palette as the list page's tarjetas-view ESTADO_BADGE_CLASSES, so a
// column's color reads consistently with the estado badges elsewhere in the app.
export const COLUMN_CLASSES: Record<Estado, { container: string; title: string; count: string }> = {
  pendiente: {
    container: 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10',
    title: 'text-amber-800 dark:text-amber-300',
    count: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  en_proceso: {
    container: 'border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10',
    title: 'text-sky-800 dark:text-sky-300',
    count: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  terminado: {
    container: 'border-green-200 bg-green-50 dark:border-green-500/20 dark:bg-green-500/10',
    title: 'text-green-800 dark:text-green-300',
    count: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  },
  cancelado: {
    container: 'border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10',
    title: 'text-red-800 dark:text-red-300',
    count: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
};

export function KanbanCard({
  orden,
  onActionSuccess,
}: {
  orden: OrdenTrabajoListItem;
  onActionSuccess: () => void;
}) {
  // Read-only card (D2) — plain markup, no drag handlers of any kind, no
  // drag-and-drop library. The actions trigger below is a click/tap control,
  // not drag-and-drop.
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-stone-800 dark:text-stone-100">{orden.numero ?? '—'}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORIDAD_BADGE_CLASSES[orden.prioridad]}`}
        >
          {PRIORIDAD_LABELS[orden.prioridad]}
        </span>
      </div>

      <div className="space-y-0.5 text-xs text-stone-600 dark:text-stone-300">
        <p>
          <span className="font-medium text-stone-800 dark:text-stone-100">Cliente:</span>{' '}
          {orden.cliente.razonSocial}
        </p>
        <p>
          <span className="font-medium text-stone-800 dark:text-stone-100">Vehículo:</span>{' '}
          {orden.vehiculo.marca.marca} {orden.vehiculo.marca.modelo}
        </p>
        <p>
          <span className="font-medium text-stone-800 dark:text-stone-100">Mecánico:</span>{' '}
          {mecanicoLabel(orden.mecanico)}
        </p>
      </div>

      {orden.tiposServicio.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {orden.tiposServicio.map((tipo) => (
            <span
              key={tipo.id}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300"
            >
              {tipo.descripcion}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-400 dark:text-stone-500">Ingreso: {formatFecha(orden.fechaIngreso)}</p>

      <KanbanCardActions orden={orden} onActionSuccess={onActionSuccess} />
    </div>
  );
}

export function KanbanColumn({
  estado,
  ordenes,
  onActionSuccess,
}: {
  estado: Estado;
  ordenes: OrdenTrabajoListItem[];
  onActionSuccess: () => void;
}) {
  const classes = COLUMN_CLASSES[estado];
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-xl border p-3 ${classes.container}`}>
      <div className="flex items-center justify-between px-1">
        <h3 className={`text-sm font-semibold ${classes.title}`}>{ESTADO_LABELS[estado]}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${classes.count}`}>
          {ordenes.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {ordenes.length === 0 ? (
          <p className="px-1 text-xs text-stone-400 dark:text-stone-500">Sin órdenes</p>
        ) : (
          ordenes.map((orden) => (
            <KanbanCard key={orden.id} orden={orden} onActionSuccess={onActionSuccess} />
          ))
        )}
      </div>
    </div>
  );
}
