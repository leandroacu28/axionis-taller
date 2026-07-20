'use client';

import { useState } from 'react';
import type { Estado, OrdenTrabajoListItem } from '../../../lib/ordenes-trabajo';
import { KanbanColumn, ESTADO_LABELS, COLUMN_CLASSES } from './KanbanColumn';

interface KanbanMobileTabsProps {
  columns: { estado: Estado; ordenes: OrdenTrabajoListItem[] }[];
  onActionSuccess: () => void;
}

export default function KanbanMobileTabs({ columns, onActionSuccess }: KanbanMobileTabsProps) {
  // D5: default to 'pendiente'; ephemeral, resets on remount, no persistence.
  const [active, setActive] = useState<Estado>('pendiente');
  const activeColumn = columns.find((c) => c.estado === active) ?? columns[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs row — 2×2 grid so all four labels+counts are fully visible at 375px
          (a single-row segmented control would reintroduce the horizontal-scroll
          sliver the redesign removes). */}
      <div className="grid grid-cols-2 gap-2">
        {columns.map(({ estado, ordenes }) => {
          const isActive = estado === active;
          return (
            <button
              key={estado}
              type="button"
              onClick={() => setActive(estado)}
              aria-pressed={isActive}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-rose-300 bg-white text-stone-900 shadow-sm dark:border-rose-500/40 dark:bg-stone-900 dark:text-stone-50'
                  : 'border-transparent bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
              }`}
            >
              <span className="truncate">{ESTADO_LABELS[estado]}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${COLUMN_CLASSES[estado].count}`}>
                {ordenes.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* The single active column — reuses the SAME KanbanColumn as desktop. */}
      <KanbanColumn
        estado={activeColumn.estado}
        ordenes={activeColumn.ordenes}
        onActionSuccess={onActionSuccess}
      />
    </div>
  );
}
