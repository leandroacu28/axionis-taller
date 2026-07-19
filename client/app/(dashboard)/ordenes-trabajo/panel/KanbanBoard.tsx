import type { Estado, OrdenTrabajoListItem, Prioridad } from '../../../lib/ordenes-trabajo';

// Re-declared locally per design.md §2.3 — small presentation maps/helpers
// duplicated from the list page rather than shared, so the list page's
// imports stay untouched (D7).
const ESTADO_LABELS: Record<Estado, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminado: 'Terminado',
  cancelado: 'Cancelado',
};

const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const PRIORIDAD_BADGE_CLASSES: Record<Prioridad, string> = {
  normal: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
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
const COLUMNS: Estado[] = ['pendiente', 'en_proceso', 'terminado', 'cancelado'];

function KanbanCard({ orden }: { orden: OrdenTrabajoListItem }) {
  // Read-only card (D2) — plain markup, no drag handlers of any kind, no
  // drag-and-drop library.
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-stone-800">{orden.numero ?? '—'}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORIDAD_BADGE_CLASSES[orden.prioridad]}`}
        >
          {PRIORIDAD_LABELS[orden.prioridad]}
        </span>
      </div>

      <div className="space-y-0.5 text-xs text-stone-600">
        <p>
          <span className="font-medium text-stone-800">Cliente:</span> {orden.cliente.razonSocial}
        </p>
        <p>
          <span className="font-medium text-stone-800">Vehículo:</span> {orden.vehiculo.marca.marca}{' '}
          {orden.vehiculo.marca.modelo}
        </p>
        <p>
          <span className="font-medium text-stone-800">Mecánico:</span> {mecanicoLabel(orden.mecanico)}
        </p>
      </div>

      {orden.tiposServicio.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {orden.tiposServicio.map((tipo) => (
            <span
              key={tipo.id}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600"
            >
              {tipo.descripcion}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-400">Ingreso: {formatFecha(orden.fechaIngreso)}</p>
    </div>
  );
}

function KanbanColumn({ estado, ordenes }: { estado: Estado; ordenes: OrdenTrabajoListItem[] }) {
  return (
    <div className="flex min-w-[260px] flex-1 flex-col gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-stone-700">{ESTADO_LABELS[estado]}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-500 shadow-sm">
          {ordenes.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {ordenes.length === 0 ? (
          <p className="px-1 text-xs text-stone-400">Sin órdenes</p>
        ) : (
          ordenes.map((orden) => <KanbanCard key={orden.id} orden={orden} />)
        )}
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  data: OrdenTrabajoListItem[];
  meta: { total: number; cap: number; capped: boolean };
}

export default function KanbanBoard({ data, meta }: KanbanBoardProps) {
  return (
    <div className="mt-6">
      {meta.capped && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Mostrando las primeras {meta.cap} de {meta.total} órdenes. Ajustá los filtros para acotar.
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((estado) => (
          <KanbanColumn
            key={estado}
            estado={estado}
            ordenes={data.filter((orden) => orden.estado === estado)}
          />
        ))}
      </div>
    </div>
  );
}
