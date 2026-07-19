import type { Estado, Prioridad } from '../../../lib/ordenes-trabajo';
import type { UserListItem } from '../../../lib/users';

export type EstadoFilter = 'all' | Estado;
export type PrioridadFilter = 'all' | Prioridad;
export type MecanicoFilter = 'all' | number;
export type DatePreset = 'hoy' | 'semana' | 'mes' | 'personalizado';

// Re-declared locally per design.md §2.3 (same tradeoff as PanelStats.tsx) —
// the list page's mecanicoLabel is not exported/shared to avoid touching its
// imports (D7).
function mecanicoLabel(mecanico: UserListItem): string {
  const fullName = `${mecanico.nombre ?? ''} ${mecanico.apellido ?? ''}`.trim();
  return fullName || mecanico.username;
}

interface PanelFiltersProps {
  mecanicos: UserListItem[];
  mecanicoId: MecanicoFilter;
  onMecanicoIdChange: (value: MecanicoFilter) => void;
  estado: EstadoFilter;
  onEstadoChange: (value: EstadoFilter) => void;
  prioridad: PrioridadFilter;
  onPrioridadChange: (value: PrioridadFilter) => void;
  datePreset: DatePreset;
  onDatePresetChange: (value: DatePreset) => void;
  customDesde: string;
  onCustomDesdeChange: (value: string) => void;
  customHasta: string;
  onCustomHastaChange: (value: string) => void;
}

const selectClassName =
  'w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100';

export default function PanelFilters({
  mecanicos,
  mecanicoId,
  onMecanicoIdChange,
  estado,
  onEstadoChange,
  prioridad,
  onPrioridadChange,
  datePreset,
  onDatePresetChange,
  customDesde,
  onCustomDesdeChange,
  customHasta,
  onCustomHastaChange,
}: PanelFiltersProps) {
  return (
    <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48 space-y-1">
          <label htmlFor="panelMecanicoFilter" className="text-sm font-medium text-stone-700">
            Mecánico
          </label>
          <select
            id="panelMecanicoFilter"
            value={mecanicoId}
            onChange={(e) =>
              onMecanicoIdChange(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
            className={selectClassName}
          >
            <option value="all">Todos</option>
            {mecanicos.map((mecanico) => (
              <option key={mecanico.id} value={mecanico.id}>
                {mecanicoLabel(mecanico)}
              </option>
            ))}
          </select>
        </div>

        <div className="w-40 space-y-1">
          <label htmlFor="panelEstadoFilter" className="text-sm font-medium text-stone-700">
            Estado
          </label>
          <select
            id="panelEstadoFilter"
            value={estado}
            onChange={(e) => onEstadoChange(e.target.value as EstadoFilter)}
            className={selectClassName}
          >
            <option value="all">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En proceso</option>
            <option value="terminado">Terminado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>

        <div className="w-40 space-y-1">
          <label htmlFor="panelPrioridadFilter" className="text-sm font-medium text-stone-700">
            Prioridad
          </label>
          <select
            id="panelPrioridadFilter"
            value={prioridad}
            onChange={(e) => onPrioridadChange(e.target.value as PrioridadFilter)}
            className={selectClassName}
          >
            <option value="all">Todas</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>

        <div className="w-40 space-y-1">
          <label htmlFor="panelDatePreset" className="text-sm font-medium text-stone-700">
            Fecha
          </label>
          <select
            id="panelDatePreset"
            value={datePreset}
            onChange={(e) => onDatePresetChange(e.target.value as DatePreset)}
            className={selectClassName}
          >
            <option value="hoy">Hoy</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mes</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>

        {datePreset === 'personalizado' && (
          <>
            <div className="w-40 space-y-1">
              <label htmlFor="panelCustomDesde" className="text-sm font-medium text-stone-700">
                Desde
              </label>
              <input
                id="panelCustomDesde"
                type="date"
                value={customDesde}
                onChange={(e) => onCustomDesdeChange(e.target.value)}
                className={selectClassName}
              />
            </div>
            <div className="w-40 space-y-1">
              <label htmlFor="panelCustomHasta" className="text-sm font-medium text-stone-700">
                Hasta
              </label>
              <input
                id="panelCustomHasta"
                type="date"
                value={customHasta}
                onChange={(e) => onCustomHastaChange(e.target.value)}
                className={selectClassName}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
