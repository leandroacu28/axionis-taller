'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchUnidadesMedida } from '../../lib/productos';

export interface Option {
  id: number;
  label: string;
}

export interface UnidadMedidaSelectProps {
  value: number | ''; // controlled id (parity with current <select>)
  initialLabel?: string; // collapsed-state label for a pre-selected id (edit load)
  onChange: (id: number) => void; // wired to parent updateField('unidadMedidaId', id)
  disabled?: boolean;
  autoFocus?: boolean;
}

const LABEL = 'Unidad de Medida';
const PLACEHOLDER = 'Seleccionar unidad de medida';

// Rough height of the results panel (search input + a handful of rows) —
// used only to decide whether it should flip upward, not to size it.
// Mirrors PANEL_HEIGHT_ESTIMATE in vehiculos/SearchableSelect.tsx (no
// quick-create footer here, so the estimate is a bit smaller).
const PANEL_HEIGHT_ESTIMATE = 280;
const SEARCH_DEBOUNCE_MS = 350;

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4 shrink-0 text-stone-400"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

/**
 * Searchable select for Unidad de Medida — copied and slimmed from
 * `vehiculos/SearchableSelect.tsx`. Per design.md's "Defer inline
 * Unidad-de-Medida quick-create" decision, this component intentionally
 * has NO `create`/`quickCreate` props, no `QuickCreateModal`, and no
 * "+ Crear ..." footer button. Only ACTIVE units are offered (the backend
 * rejects an inactive `unidadMedidaId` on both create and update), enforced
 * by `searchUnidadesMedida` (`status: 'activo'`).
 */
export default function UnidadMedidaSelect({
  value,
  initialLabel,
  onChange,
  disabled,
  autoFocus,
}: UnidadMedidaSelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const displayText = selectedLabel ?? initialLabel ?? '';

  // If the parent externally resets the controlled value (e.g. discarding
  // the form), fall back to the placeholder instead of keeping a stale label.
  useEffect(() => {
    if (value === '') setSelectedLabel(null);
  }, [value]);

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closePanel = () => {
    setOpen(false);
    setPanelPos(null);
  };

  const openPanel = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUpward = window.innerHeight - rect.bottom < PANEL_HEIGHT_ESTIMATE;
    setPanelPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUpward,
    });
    setSearchInput('');
    setSearchTerm('');
    setHighlightedIndex(0);
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (open) {
      closePanel();
      return;
    }
    openPanel();
  };

  // Instant `searchInput` -> debounced `searchTerm`, same two-state pattern
  // as vehiculos/SearchableSelect.tsx.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      setSearchTerm(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, open]);

  // Fires the entity search whenever the debounced term changes AND whenever
  // the panel transitions to open (so opening with an empty term still shows
  // a default result set instead of an empty panel).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    searchUnidadesMedida(searchTerm)
      .then((data) => {
        if (cancelled) return;
        setResults(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchTerm, open]);

  // Keep the highlight in range when the result set shrinks.
  useEffect(() => {
    setHighlightedIndex((prev) => Math.min(prev, Math.max(results.length - 1, 0)));
  }, [results]);

  // Scroll the highlighted row into view — a no-op when it's already visible
  // (mouse hover), so only keyboard navigation past the fold actually scrolls.
  useEffect(() => {
    rowRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  // Dismiss handling: click outside, resize, and (non-capture) page scroll.
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) closePanel();
    };
    const handleReposition = () => {
      closePanel();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    // Non-capture on purpose: the results list has its own overflow-y-auto,
    // and `scroll` does not bubble, so inner-list scrolling never reaches
    // `window` while page scroll still closes the panel.
    window.addEventListener('scroll', handleReposition);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition);
    };
  }, [open]);

  const selectOption = (option: Option) => {
    onChange(option.id);
    setSelectedLabel(option.label);
    closePanel();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = results[highlightedIndex];
      if (option) selectOption(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {LABEL} <span className="text-rose-500">*</span>
      </label>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={displayText ? '' : 'text-stone-400'}>{displayText || PLACEHOLDER}</span>
        <ChevronIcon />
      </button>

      {open &&
        panelPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              transform: panelPos.openUpward ? 'translateY(-100%)' : undefined,
            }}
            className="z-50 flex max-h-80 flex-col rounded-lg border border-stone-200 bg-white shadow-lg"
          >
            <div className="border-b border-stone-200 p-2">
              <input
                ref={searchInputRef}
                type="text"
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar..."
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-stone-500">
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
                    aria-hidden="true"
                  />
                  Buscando...
                </div>
              ) : error ? (
                <div className="p-4 text-sm text-red-600">{error}</div>
              ) : results.length === 0 ? (
                <div className="p-4 text-sm text-stone-500">Sin resultados.</div>
              ) : (
                results.map((option, index) => (
                  <div
                    key={option.id}
                    ref={(el) => {
                      rowRefs.current[index] = el;
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      index === highlightedIndex ? 'bg-rose-50 text-rose-700' : 'text-stone-700'
                    }`}
                  >
                    {option.label}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
