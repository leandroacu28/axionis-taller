'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchProductos } from '../../lib/productos';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';

// NOTE (design.md Decision D7 / presupuestos-management-ui spec — "Product
// Line-Item Editor Is Presupuestos-Local"): this component is a DUPLICATE of
// the ProductoPicker + line-item list pattern in
// ordenes-trabajo/[id]/trabajo/page.tsx (lines ~265-750). It is intentionally
// NOT imported from ordenes-trabajo and does not import anything from that
// module — only the already-generic `searchProductos` helper is shared, per
// design.md.

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

interface ProductoOption {
  id: number;
  label: string;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

interface ProductoPickerProps {
  id: string;
  value: ProductoOption | null;
  onSelect: (option: ProductoOption) => void;
  disabled?: boolean;
}

// Rough height of the results panel (search input + a handful of rows) —
// used only to decide whether it should flip upward, not to size it. Mirrors
// PRODUCTO_PANEL_HEIGHT_ESTIMATE in ordenes-trabajo/[id]/trabajo/page.tsx.
const PRODUCTO_PANEL_HEIGHT_ESTIMATE = 280;
const PRODUCTO_SEARCH_DEBOUNCE_MS = 350;

function ProductoPicker({ id, value, onSelect, disabled }: ProductoPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<DropdownPosition | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProductoOption[]>([]);
  const [error, setError] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const closePanel = () => {
    setOpen(false);
    setPanelPos(null);
  };

  const openPanel = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUpward = window.innerHeight - rect.bottom < PRODUCTO_PANEL_HEIGHT_ESTIMATE;
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

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      setSearchTerm(searchInput);
    }, PRODUCTO_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    searchProductos(searchTerm)
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

  useEffect(() => {
    setHighlightedIndex((prev) => Math.min(prev, Math.max(results.length - 1, 0)));
  }, [results]);

  useEffect(() => {
    rowRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) closePanel();
    };
    const handleReposition = () => closePanel();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition);
    };
  }, [open]);

  const selectOption = (option: ProductoOption) => {
    onSelect(option);
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
    <div className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={value ? '' : 'text-stone-400'}>{value ? value.label : 'Seleccionar producto...'}</span>
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
                placeholder="Buscar producto..."
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

// Shape shared by both staged (in-memory, pre-save) and live (server-backed)
// line items — a staged line has a synthetic negative `id` until the header
// POST assigns it a real one; a live line's `id` is always the real
// PresupuestoProducto.id.
export interface PresupuestoLineaEditable {
  id: number;
  cantidad: string;
  precioUnitario: string;
  precioTotal: string;
  producto: { id: number; descripcion: string };
}

export interface PresupuestoProductosEditorProps {
  // 'staged' (nuevo) vs 'live' (editar/[id]) — informational for copy/labels;
  // all actual persistence behavior is provided by the injected handlers
  // (Decision A1), keeping this component itself mode-agnostic.
  mode: 'staged' | 'live';
  lines: PresupuestoLineaEditable[];
  onAdd: (productoId: number, cantidad: number) => Promise<void>;
  onUpdate: (lineId: number, cantidad: number) => Promise<void>;
  onRemove: (lineId: number) => Promise<void>;
  disabled?: boolean;
}

export default function PresupuestoProductosEditor({
  mode,
  lines,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: PresupuestoProductosEditorProps) {
  const [productoSel, setProductoSel] = useState<ProductoOption | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [busyLineaId, setBusyLineaId] = useState<number | null>(null);
  const [cantidadEdits, setCantidadEdits] = useState<Record<number, string>>({});

  const bloqueada = disabled ?? false;

  const getCantidadInput = (linea: PresupuestoLineaEditable) => cantidadEdits[linea.id] ?? linea.cantidad;

  const handleAgregar = async () => {
    if (bloqueada || agregando) return;
    if (!productoSel) {
      showError('Seleccioná un producto', 'Elegí un producto antes de agregarlo.');
      return;
    }
    const cantidadNum = Number(cantidad);
    if (!cantidad || Number.isNaN(cantidadNum) || cantidadNum <= 0) {
      showError('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }

    setAgregando(true);
    try {
      await onAdd(productoSel.id, cantidadNum);
      setProductoSel(null);
      setCantidad('');
      showSuccess('Producto agregado', `${productoSel.label} se agregó al presupuesto.`);
    } catch (err) {
      showError(
        'No se pudo agregar el producto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setAgregando(false);
    }
  };

  const handleActualizar = async (linea: PresupuestoLineaEditable) => {
    if (bloqueada || busyLineaId !== null) return;
    const nextValue = getCantidadInput(linea);
    const cantidadNum = Number(nextValue);
    if (!nextValue || Number.isNaN(cantidadNum) || cantidadNum <= 0) {
      showError('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }

    setBusyLineaId(linea.id);
    try {
      await onUpdate(linea.id, cantidadNum);
      setCantidadEdits((prev) => {
        const next = { ...prev };
        delete next[linea.id];
        return next;
      });
    } catch (err) {
      showError(
        'No se pudo actualizar el producto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setBusyLineaId(null);
    }
  };

  const handleQuitar = async (linea: PresupuestoLineaEditable) => {
    if (bloqueada || busyLineaId !== null) return;
    const confirmed = await showConfirm({
      title: 'Quitar producto',
      text: `¿Confirmás quitar "${linea.producto.descripcion}" de este presupuesto?`,
      confirmButtonText: 'Sí, quitar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirmed) return;

    setBusyLineaId(linea.id);
    try {
      await onRemove(linea.id);
      setCantidadEdits((prev) => {
        const next = { ...prev };
        delete next[linea.id];
        return next;
      });
      showSuccess('Producto quitado', `${linea.producto.descripcion} se quitó del presupuesto.`);
    } catch (err) {
      showError(
        'No se pudo quitar el producto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setBusyLineaId(null);
    }
  };

  const total = lines.reduce((sum, l) => sum + Number(l.precioTotal), 0);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-stone-700">Productos</h3>

      {lines.length === 0 ? (
        <p className="text-sm text-stone-400">
          {mode === 'staged'
            ? 'Todavía no agregaste productos a este presupuesto.'
            : 'Este presupuesto no tiene productos todavía.'}
        </p>
      ) : (
        <div className="space-y-2">
          {lines.map((linea) => (
            <div
              key={linea.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                {linea.producto.descripcion}
              </span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={getCantidadInput(linea)}
                onChange={(e) => setCantidadEdits((prev) => ({ ...prev, [linea.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleActualizar(linea);
                  }
                }}
                disabled={bloqueada || busyLineaId === linea.id}
                aria-label={`Cantidad de ${linea.producto.descripcion}`}
                className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="w-24 shrink-0 text-right text-xs text-stone-500">
                {`$${Number(linea.precioUnitario).toFixed(2)}`} c/u
              </span>
              <span className="w-24 shrink-0 text-right text-sm font-semibold text-stone-800">
                {`$${Number(linea.precioTotal).toFixed(2)}`}
              </span>
              {!bloqueada && (
                <>
                  <button
                    type="button"
                    onClick={() => handleActualizar(linea)}
                    disabled={busyLineaId === linea.id}
                    className="shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyLineaId === linea.id ? '...' : 'Actualizar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuitar(linea)}
                    disabled={busyLineaId === linea.id}
                    className="shrink-0 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Quitar
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="flex justify-end pr-3 text-sm font-semibold text-stone-800">
            Total: ${total.toFixed(2)}
          </div>
        </div>
      )}

      {!bloqueada && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="min-w-[10rem] flex-1">
            <ProductoPicker
              id="presupuesto-producto-picker"
              value={productoSel}
              onSelect={setProductoSel}
              disabled={agregando}
            />
          </div>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAgregar();
              }
            }}
            disabled={agregando}
            placeholder="Cantidad"
            aria-label="Cantidad a agregar"
            className="w-24 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleAgregar}
            disabled={agregando}
            className="shrink-0 rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {agregando ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
      )}
    </div>
  );
}
