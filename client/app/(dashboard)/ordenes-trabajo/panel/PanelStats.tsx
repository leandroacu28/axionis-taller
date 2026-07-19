import type { Estado, PanelStats as PanelStatsData } from '../../../lib/ordenes-trabajo';

// Re-declares the small estado palette local to this file rather than
// importing it from the list page (design.md §2.3 — extracting a shared
// module would require touching the list page's imports, which violates the
// proposal's D7 "list page untouched" constraint).
const ESTADO_BADGE_CLASSES: Record<Estado, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  en_proceso: 'bg-sky-100 text-sky-700',
  terminado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

interface Figure {
  label: string;
  value: number;
  badgeClass: string;
}

export default function PanelStats({ stats }: { stats: PanelStatsData }) {
  const figures: Figure[] = [
    { label: 'Del día', value: stats.delDia, badgeClass: 'bg-stone-100 text-stone-700' },
    { label: 'Pendientes', value: stats.pendiente, badgeClass: ESTADO_BADGE_CLASSES.pendiente },
    { label: 'En proceso', value: stats.enProceso, badgeClass: ESTADO_BADGE_CLASSES.en_proceso },
    { label: 'Terminados', value: stats.terminado, badgeClass: ESTADO_BADGE_CLASSES.terminado },
    {
      label: 'Mecánicos trabajando',
      value: stats.mecanicosTrabajando,
      badgeClass: 'bg-purple-100 text-purple-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {figures.map((figure) => (
        <div
          key={figure.label}
          className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${figure.badgeClass}`}>
            {figure.label}
          </span>
          <span className="text-2xl font-bold text-stone-900">{figure.value}</span>
        </div>
      ))}
    </div>
  );
}
