'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QuickCreateModal, { type QuickCreateField } from './QuickCreateModal';
import { showSuccess } from '../../lib/alerts';

export interface Option {
  id: number;
  label: string;
}

export interface SearchableSelectProps {
  label: string;
  placeholder: string;
  value: number | ''; // controlled id (parity with current <select>)
  initialLabel?: string; // collapsed-state label for a pre-selected id (edit load)
  onChange: (id: number) => void; // wired to parent updateField(fieldKey, id)
  search: (term: string) => Promise<Option[]>;
  // `create`/`quickCreate` are a pair: both optional, both present or both
  // absent. When omitted, the "+ Crear" footer and `QuickCreateModal` are
  // not rendered at all (design.md DD3) — used by pickers where inline
  // creation doesn't make sense (e.g. mecánico).
  create?: (values: Record<string, string>) => Promise<Option>;
  quickCreate?: {
    title: string;
    entityLabel: string;
    fields: QuickCreateField[];
    prefillField?: string;
    successTitle: string;
    successText: string;
  };
  // `renderQuickCreate`/`createLabel` are the alternative pair for pickers
  // whose create flow needs more than the generic `QuickCreateModal` can
  // host (e.g. nested FK `SearchableSelect`s) — used by the Vehículo picker
  // in `OrdenTrabajoForm.tsx` via `VehiculoQuickCreateModal`. Both optional;
  // mutually exclusive with `create`/`quickCreate` in practice, but not
  // enforced at the type level.
  renderQuickCreate?: (args: {
    open: boolean;
    prefillValue: string;
    onClose: () => void;
    onCreated: (option: Option) => void;
  }) => React.ReactNode;
  createLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

// Rough height of the results panel (search input + up to 5 visible rows +
// footer action) — used only to decide whether it should flip upward, not to
// size it. Mirrors MENU_HEIGHT_ESTIMATE in vehiculos/page.tsx.
const PANEL_HEIGHT_ESTIMATE = 260;
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

export default function SearchableSelect({
  label,
  placeholder,
  value,
  initialLabel,
  onChange,
  search,
  create,
  quickCreate,
  renderQuickCreate,
  createLabel,
  disabled,
  autoFocus,
}: SearchableSelectProps) {
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
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
    setQuickCreateOpen(false);
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
  // as vehiculos/page.tsx's list search.
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
    search(searchTerm)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // While the quick-create modal is open on top, none of these should close
  // the panel — Modal.tsx already freezes body scroll, and clicks inside the
  // modal are legitimately "outside" the panel/trigger refs.
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (quickCreateOpen) return;
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) closePanel();
    };
    const handleReposition = () => {
      if (quickCreateOpen) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quickCreateOpen]);

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
      // Nested-Escape guard: when the quick-create modal is open, Modal.tsx's
      // own document-level listener owns this keypress. Leaving this branch
      // untouched keeps the panel open and lets a second Escape close it.
      if (quickCreateOpen) return;
      event.preventDefault();
      closePanel();
      triggerRef.current?.focus();
    }
  };

  const openQuickCreate = () => {
    setQuickCreateOpen(true);
  };

  // Shared "created successfully" path for both quick-create mechanisms:
  // selects the new option through the same setter an existing-option click
  // would use, closes the quick-create layer, and closes the panel. Reused
  // by the generic `quickCreate` submit handler below and by whatever
  // `renderQuickCreate` node the caller renders (e.g.
  // `VehiculoQuickCreateModal`), so the resulting label is never stale.
  const handleCreated = (option: Option) => {
    onChange(option.id);
    setSelectedLabel(option.label);
    setQuickCreateOpen(false);
    closePanel();
  };

  const handleQuickCreateSubmit = async (values: Record<string, string>) => {
    if (!create || !quickCreate) return;
    const created = await create(values);
    handleCreated(created);
    showSuccess(quickCreate.successTitle, quickCreate.successText);
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label} <span className="text-rose-500">*</span>
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
        <span className={displayText ? '' : 'text-stone-400'}>{displayText || placeholder}</span>
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
            <div className="max-h-[180px] overflow-y-auto">
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
            {(quickCreate || renderQuickCreate) && (
              <button
                type="button"
                onClick={openQuickCreate}
                className="border-t border-stone-200 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                + Crear {quickCreate ? quickCreate.entityLabel : createLabel}
              </button>
            )}
          </div>,
          document.body,
        )}

      {quickCreate && (
        <QuickCreateModal
          open={quickCreateOpen}
          title={quickCreate.title}
          entityLabel={quickCreate.entityLabel}
          fields={quickCreate.fields}
          prefillField={quickCreate.prefillField}
          prefillValue={searchInput}
          onSubmit={handleQuickCreateSubmit}
          onClose={() => {
            setQuickCreateOpen(false);
            searchInputRef.current?.focus();
          }}
        />
      )}

      {renderQuickCreate &&
        renderQuickCreate({
          open: quickCreateOpen,
          prefillValue: searchInput,
          onClose: () => {
            setQuickCreateOpen(false);
            searchInputRef.current?.focus();
          },
          onCreated: handleCreated,
        })}
    </div>
  );
}
