import type { Estado, PanelStats as PanelStatsData } from '../../../lib/ordenes-trabajo';

// Re-declares the small estado palette local to this file rather than
// importing it from the list page (design.md §2.3 — extracting a shared
// module would require touching the list page's imports, which violates the
// proposal's D7 "list page untouched" constraint).
const ESTADO_BADGE_CLASSES: Record<Estado, string> = {
  pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  en_proceso: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  terminado: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

function SquaresIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.106-.233a4.5 4.5 0 01-1.307-8.86 4.5 4.5 0 016.336 4.486M17.25 8.25a3 3 0 00-3-3" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

interface Figure {
  label: string;
  value: number;
  badgeClass: string;
  unit: (value: number) => string;
  icon: JSX.Element;
  iconClass: string;
}

const ordenesUnit = (value: number) => (value === 1 ? 'orden' : 'órdenes');
const mecanicosUnit = (value: number) => (value === 1 ? 'mecánico' : 'mecánicos');

export default function PanelStats({ stats, total }: { stats: PanelStatsData; total: number }) {
  const figures: Figure[] = [
    // Total de órdenes que coinciden con los filtros actuales — reacciona al
    // filtro de fecha (y al resto de los filtros), a diferencia de "Del día"
    // que siempre mide el día calendario actual.
    {
      label: 'Total de órdenes',
      value: total,
      badgeClass: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
      unit: ordenesUnit,
      icon: <SquaresIcon />,
      iconClass: 'text-stone-400 dark:text-stone-500',
    },
    {
      label: 'Pendientes',
      value: stats.pendiente,
      badgeClass: ESTADO_BADGE_CLASSES.pendiente,
      unit: ordenesUnit,
      icon: <ClockIcon />,
      iconClass: 'text-amber-500 dark:text-amber-400',
    },
    {
      label: 'En proceso',
      value: stats.enProceso,
      badgeClass: ESTADO_BADGE_CLASSES.en_proceso,
      unit: ordenesUnit,
      icon: <WrenchIcon />,
      iconClass: 'text-sky-500 dark:text-sky-400',
    },
    {
      label: 'Terminados',
      value: stats.terminado,
      badgeClass: ESTADO_BADGE_CLASSES.terminado,
      unit: ordenesUnit,
      icon: <CheckCircleIcon />,
      iconClass: 'text-green-500 dark:text-green-400',
    },
    {
      label: 'Mecánicos trabajando',
      value: stats.mecanicosTrabajando,
      badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
      unit: mecanicosUnit,
      icon: <UsersIcon />,
      iconClass: 'text-purple-500 dark:text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {figures.map((figure) => (
        <div
          key={figure.label}
          className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-colors dark:border-stone-700 dark:bg-stone-900"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${figure.badgeClass}`}>
              {figure.label}
            </span>
            <span className={figure.iconClass}>{figure.icon}</span>
          </div>
          <span className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-stone-900 dark:text-stone-50">{figure.value}</span>
            <span className="text-xs text-stone-500 dark:text-stone-400">{figure.unit(figure.value)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
