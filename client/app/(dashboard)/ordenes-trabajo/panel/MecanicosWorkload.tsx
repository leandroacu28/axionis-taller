import type { MecanicoWorkload } from '../../../lib/ordenes-trabajo';

// Re-declared per D7 — same formula as the server's labelFor and the list
// page's mecanicoLabel. Not extracted (would touch untouched surfaces).
function mecanicoLabel(m: { nombre: string | null; apellido: string | null; username: string }): string {
  return `${m.nombre ?? ''} ${m.apellido ?? ''}`.trim() || m.username;
}

function ordenesLabel(count: number): string {
  return count === 1 ? 'orden de trabajo' : 'órdenes de trabajo';
}

function ChartBarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

export default function MecanicosWorkload({ mecanicos }: { mecanicos: MecanicoWorkload[] }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700 dark:text-stone-200">
        <span className="text-stone-400 dark:text-stone-500">
          <ChartBarIcon />
        </span>
        Carga por mecánico
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {mecanicos.map((m) => (
          <div
            key={m.mecanicoId}
            className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <span className="truncate text-sm font-medium text-stone-700 dark:text-stone-200" title={mecanicoLabel(m)}>
              {mecanicoLabel(m)}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-stone-900 dark:text-stone-50">{m.count}</span>
              <span className="text-xs text-stone-500 dark:text-stone-400">{ordenesLabel(m.count)}</span>
            </span>

            {/* Horizontal bar — fills left-to-right by percentage, purely visual (no
                load-level color coding, matches design.md ADR-6's "keep it a plain
                figure grid" intent while adding the requested at-a-glance indicator).
                Track gets a dark pair; the gradient fill is deliberately left
                unchanged in dark mode (ADR-D) — it already reads clearly against
                both the dark track and the gray-950 shell. */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-400"
                style={{ width: `${m.percentage}%` }}
              />
            </div>
            <span className="text-xs text-stone-500 dark:text-stone-400">{m.percentage}% de la carga</span>
          </div>
        ))}
      </div>
    </section>
  );
}
