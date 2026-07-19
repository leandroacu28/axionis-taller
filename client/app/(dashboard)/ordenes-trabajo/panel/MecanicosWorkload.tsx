import type { MecanicoWorkload } from '../../../lib/ordenes-trabajo';

// Re-declared per D7 — same formula as the server's labelFor and the list
// page's mecanicoLabel. Not extracted (would touch untouched surfaces).
function mecanicoLabel(m: { nombre: string | null; apellido: string | null; username: string }): string {
  return `${m.nombre ?? ''} ${m.apellido ?? ''}`.trim() || m.username;
}

function ordenesLabel(count: number): string {
  return count === 1 ? 'orden de trabajo' : 'órdenes de trabajo';
}

export default function MecanicosWorkload({ mecanicos }: { mecanicos: MecanicoWorkload[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Carga por mecánico</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {mecanicos.map((m) => (
          <div
            key={m.mecanicoId}
            className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <span className="truncate text-sm font-medium text-stone-700" title={mecanicoLabel(m)}>
              {mecanicoLabel(m)}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-stone-900">{m.count}</span>
              <span className="text-xs text-stone-500">{ordenesLabel(m.count)}</span>
            </span>

            {/* Horizontal bar — fills left-to-right by percentage, purely visual (no
                load-level color coding, matches design.md ADR-6's "keep it a plain
                figure grid" intent while adding the requested at-a-glance indicator). */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-400"
                style={{ width: `${m.percentage}%` }}
              />
            </div>
            <span className="text-xs text-stone-500">{m.percentage}% de la carga</span>
          </div>
        ))}
      </div>
    </section>
  );
}
