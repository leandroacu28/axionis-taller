'use client';

import { useEffect, useState } from 'react';
import { getOrdenesTrabajoPanel, type PanelResponse } from '../../../lib/ordenes-trabajo';
import { listUsers, type UserListItem } from '../../../lib/users';
import PanelStats from './PanelStats';
import PanelFilters, {
  type DatePreset,
  type EstadoFilter,
  type MecanicoFilter,
  type PrioridadFilter,
} from './PanelFilters';
import KanbanBoard from './KanbanBoard';

// Browser-local yyyy-mm-dd formatting (no UTC conversion) — "today" is a
// client concept per ADR-3, resolved from the operator's own calendar date.
function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Monday-start ISO week (es-AR convention, design.md §3.4).
function mondayOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Resolves the active date preset to a concrete { fechaDesde, fechaHasta }
// window per design.md §3.4's "period-to-date" model. Returns null when
// `personalizado` is active but not yet a valid range (both dates set,
// desde <= hasta) — the caller must not fetch in that case (tasks.md 8.3).
function resolveDateWindow(
  preset: DatePreset,
  customDesde: string,
  customHasta: string,
): { fechaDesde: string; fechaHasta: string } | null {
  const today = new Date();
  if (preset === 'hoy') {
    const hoy = toYmd(today);
    return { fechaDesde: hoy, fechaHasta: hoy };
  }
  if (preset === 'semana') {
    return { fechaDesde: toYmd(mondayOfWeek(today)), fechaHasta: toYmd(today) };
  }
  if (preset === 'mes') {
    return { fechaDesde: toYmd(firstOfMonth(today)), fechaHasta: toYmd(today) };
  }
  // personalizado
  if (!customDesde || !customHasta || customDesde > customHasta) return null;
  return { fechaDesde: customDesde, fechaHasta: customHasta };
}

export default function PanelTrabajoPage() {
  const [estado, setEstado] = useState<EstadoFilter>('all');
  const [mecanicoId, setMecanicoId] = useState<MecanicoFilter>('all');
  const [prioridad, setPrioridad] = useState<PrioridadFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('hoy');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [mecanicos, setMecanicos] = useState<UserListItem[]>([]);
  const [result, setResult] = useState<PanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Mecánico options for the filter bar — fetched once on mount, same pool
  // and pattern as the list page (tasks.md 8.1).
  useEffect(() => {
    listUsers({ status: 'activo' })
      .then(setMecanicos)
      .catch(() => {
        // Filter degrades to just "Todos" if this fails — not worth a
        // separate error banner for a secondary control.
      });
  }, []);

  const loadPanel = async () => {
    const window = resolveDateWindow(datePreset, customDesde, customHasta);
    // personalizado not yet valid (missing/invalid range) — no fetch, no
    // loading/error state change, board simply keeps its last result.
    if (!window) return;

    setLoading(true);
    setError('');
    try {
      const hoy = toYmd(new Date());
      const panel = await getOrdenesTrabajoPanel({
        estado,
        mecanicoId: mecanicoId === 'all' ? undefined : mecanicoId,
        prioridad,
        fechaDesde: window.fechaDesde,
        fechaHasta: window.fechaHasta,
        hoy,
      });
      setResult(panel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, mecanicoId, prioridad, datePreset, customDesde, customHasta]);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Panel de Trabajo</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Vista operativa en vivo del estado del taller.
        </p>
      </div>

      {result && <PanelStats stats={result.stats} />}

      <PanelFilters
        mecanicos={mecanicos}
        mecanicoId={mecanicoId}
        onMecanicoIdChange={setMecanicoId}
        estado={estado}
        onEstadoChange={setEstado}
        prioridad={prioridad}
        onPrioridadChange={setPrioridad}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        customDesde={customDesde}
        onCustomDesdeChange={setCustomDesde}
        customHasta={customHasta}
        onCustomHastaChange={setCustomHasta}
      />

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando panel de trabajo...
        </div>
      ) : error ? (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadPanel}
            className="shrink-0 font-medium text-red-700 underline hover:text-red-800"
          >
            Reintentar
          </button>
        </div>
      ) : !result || result.data.length === 0 ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 shadow-sm">
          No se encontraron órdenes con los filtros seleccionados.
        </div>
      ) : (
        <KanbanBoard data={result.data} meta={result.meta} />
      )}
    </div>
  );
}
