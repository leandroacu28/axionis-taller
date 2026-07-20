'use client';

import { useEffect, useState } from 'react';
import {
  getOrdenesTrabajoPanel,
  getPanelMecanicos,
  type MecanicoWorkload,
  type PanelResponse,
} from '../../../lib/ordenes-trabajo';
import { listUsers, type UserListItem } from '../../../lib/users';
import PanelStats from './PanelStats';
import PanelFilters, {
  type DatePreset,
  type EstadoFilter,
  type MecanicoFilter,
  type PrioridadFilter,
} from './PanelFilters';
import KanbanBoard from './KanbanBoard';
import MecanicosWorkload from './MecanicosWorkload';
import PanelStateBox from './PanelStateBox';

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

  // Independent from result/loading/error above (design.md §2.3) — the
  // per-mechanic workload section has its own fetch lifecycle, decoupled
  // from the filter-driven panel fetch.
  const [mecanicosWorkload, setMecanicosWorkload] = useState<MecanicoWorkload[] | null>(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);
  const [workloadError, setWorkloadError] = useState('');

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

  const loadWorkload = async () => {
    setWorkloadLoading(true);
    setWorkloadError('');
    try {
      const res = await getPanelMecanicos();
      setMecanicosWorkload(res.mecanicos);
    } catch (err) {
      setWorkloadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setWorkloadLoading(false);
    }
  };

  // Fetch ONCE on mount. This section is filter-INDEPENDENT (D1): its deps
  // array is intentionally EMPTY. Do NOT add estado/mecanicoId/prioridad/
  // date deps here — unlike the loadPanel() effect above, which IS correctly
  // keyed on every filter. Adding filter deps would (a) re-shape a section
  // that must stay global, and (b) waste a request returning identical data.
  // See design.md ADR-5.
  useEffect(() => {
    loadWorkload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Panel de Trabajo</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Vista operativa en vivo del estado del taller.
        </p>
      </div>

      {result && <PanelStats stats={result.stats} total={result.meta.total} />}

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
        <PanelStateBox variant="loading" message="Cargando panel de trabajo..." className="mt-6" />
      ) : error ? (
        <PanelStateBox variant="error" message={error} onRetry={loadPanel} className="mt-6" />
      ) : !result || result.data.length === 0 ? (
        <PanelStateBox
          variant="empty"
          message="No se encontraron órdenes con los filtros seleccionados."
          className="mt-6"
        />
      ) : (
        <KanbanBoard data={result.data} meta={result.meta} onActionSuccess={loadPanel} />
      )}

      {/* Per-mechanic open-workload — independent of the filter bar (D1). Conditions UNCHANGED. */}
      {workloadLoading ? (
        <PanelStateBox variant="loading" message="Cargando carga por mecánico..." className="mt-8" />
      ) : workloadError ? (
        <PanelStateBox variant="error" message={workloadError} onRetry={loadWorkload} className="mt-8" />
      ) : mecanicosWorkload && mecanicosWorkload.length > 0 ? (
        <MecanicosWorkload mecanicos={mecanicosWorkload} />
      ) : (
        <PanelStateBox
          variant="empty"
          message="No hay mecánicos activos para mostrar."
          className="mt-8"
        />
      )}
    </div>
  );
}
