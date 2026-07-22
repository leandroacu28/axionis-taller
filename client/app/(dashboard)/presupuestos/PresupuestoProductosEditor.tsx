'use client';

import { useEffect, useState } from 'react';
import { listProductos, type ProductoListItem } from '../../lib/productos';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';
import Modal from '../../components/ui/Modal';

// NOTE (design.md Decision D7 / presupuestos-management-ui spec — "Product
// Line-Item Editor Is Presupuestos-Local"): this component is a DUPLICATE of
// the ProductoPicker + line-item list pattern in
// ordenes-trabajo/[id]/trabajo/page.tsx (lines ~265-750). It is intentionally
// NOT imported from ordenes-trabajo and does not import anything from that
// module — only the already-generic `searchProductos` helper is shared, per
// design.md.

// Drops the trailing ".00" for whole amounts — keeps decimals only when
// there's an actual fractional value to show.
function formatMoney(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

const BUSCAR_PRODUCTO_PAGE_SIZE = 8;
const BUSCAR_PRODUCTO_DEBOUNCE_MS = 350;

interface BuscarProductoModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (productoId: number, cantidad: number, precioUnitario: number) => Promise<void>;
}

// Full-page-style browse modal (search + pagination + product cards), an
// alternative to the compact `ProductoPicker` dropdown below — same
// `searchProductos`-adjacent data source but built for scanning many
// products at once rather than typing an exact match.
function BuscarProductoModal({ open, onClose, onAdd }: BuscarProductoModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [productos, setProductos] = useState<ProductoListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedProducto, setSelectedProducto] = useState<ProductoListItem | null>(null);
  const [cantidadInput, setCantidadInput] = useState('1');
  const [precioInput, setPrecioInput] = useState('');
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearchInput('');
    setSearchTerm('');
    setPage(1);
    setSelectedProducto(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, BUSCAR_PRODUCTO_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    listProductos({ page, pageSize: BUSCAR_PRODUCTO_PAGE_SIZE, search: searchTerm || undefined, status: 'activo' })
      .then((result) => {
        if (cancelled) return;
        setProductos(result.data);
        setTotal(result.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
        setProductos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, page, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(total / BUSCAR_PRODUCTO_PAGE_SIZE));

  const handleSelectProducto = (producto: ProductoListItem) => {
    setSelectedProducto(producto);
    setCantidadInput('1');
    setPrecioInput(producto.precioVenta !== null ? String(producto.precioVenta) : '');
  };

  const handleVolver = () => {
    setSelectedProducto(null);
  };

  // Cantidad only ever moves in whole units via the -/+ steppers — mirrors
  // ActualizarProductoModal's stepCantidad.
  const stepCantidad = (delta: number) => {
    const current = Math.floor(Number(cantidadInput)) || 0;
    setCantidadInput(String(Math.max(1, current + delta)));
  };

  const handleAgregarDesdeModal = async () => {
    if (agregando || !selectedProducto) return;
    const cantidadNum = Number(cantidadInput);
    if (!cantidadInput || Number.isNaN(cantidadNum) || cantidadNum <= 0) {
      showError('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }
    const precioNum = Number(precioInput);
    if (!precioInput || Number.isNaN(precioNum) || precioNum <= 0) {
      showError('Precio inválido', 'Ingresá un precio mayor a 0.');
      return;
    }

    setAgregando(true);
    try {
      await onAdd(selectedProducto.id, cantidadNum, precioNum);
      showSuccess('Producto agregado', `${selectedProducto.descripcion} se agregó al presupuesto.`);
      setSelectedProducto(null);
      setCantidadInput('1');
      setPrecioInput('');
    } catch (err) {
      showError(
        'No se pudo agregar el producto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setAgregando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buscar producto"
      titleClassName="text-white"
      headerClassName="-mx-6 -mt-6 rounded-t-xl bg-slate-900 px-6 py-4"
      closeButtonClassName="bg-red-600 text-white hover:bg-red-700"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {selectedProducto ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold text-stone-900">{selectedProducto.descripcion}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="buscar-producto-cantidad" className="block text-center text-sm font-semibold text-black">
                  Cantidad
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => stepCantidad(-1)}
                    disabled={agregando}
                    aria-label="Disminuir cantidad"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black bg-slate-900 text-base font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    −
                  </button>
                  <input
                    id="buscar-producto-cantidad"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={cantidadInput}
                    onChange={(e) => setCantidadInput(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    disabled={agregando}
                    className="w-full min-w-0 rounded-lg border border-black bg-white px-2 py-2 text-center text-sm font-semibold text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => stepCantidad(1)}
                    disabled={agregando}
                    aria-label="Aumentar cantidad"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black bg-slate-900 text-base font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="buscar-producto-precio" className="block text-center text-sm font-semibold text-black">
                  Precio unitario
                </label>
                <input
                  id="buscar-producto-precio"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={precioInput}
                  onChange={(e) => setPrecioInput(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  disabled={agregando}
                  className="w-full rounded-lg border border-black bg-white px-3 py-2 text-center text-sm font-semibold text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleVolver}
                disabled={agregando}
                className="rounded-lg border border-black bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleAgregarDesdeModal}
                disabled={agregando}
                className="rounded-lg border border-black bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {agregando ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              type="text"
              autoFocus
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por descripción o código..."
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />

            {!loading && !error && productos.length > 0 && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-stone-600">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
                  aria-hidden="true"
                />
                Buscando...
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-red-600">{error}</div>
            ) : productos.length === 0 ? (
              <div className="p-8 text-center text-sm text-stone-500">Sin resultados.</div>
            ) : (
              <div className="grid max-h-72 grid-cols-1 gap-3 overflow-y-auto pr-1">
                {productos.map((producto) => (
                  <button
                    key={producto.id}
                    type="button"
                    onClick={() => handleSelectProducto(producto)}
                    className="flex flex-col gap-1 rounded-lg border border-stone-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50"
                  >
                    <span className="truncate text-sm font-semibold text-stone-800">{producto.descripcion}</span>
                    {producto.codigo && (
                      <span className="text-xs text-stone-400">Código: {producto.codigo}</span>
                    )}
                    <span className="text-sm font-medium text-stone-600">
                      {producto.precioVenta !== null ? `$${Number(producto.precioVenta).toFixed(2)}` : 'Sin precio'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
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
  producto: { id: number; descripcion: string } | null;
  descripcionPersonalizada: string | null;
}

// producto is null for a custom (free-text) item — falls back to
// descripcionPersonalizada wherever the line's name is displayed.
function lineaDescripcion(linea: PresupuestoLineaEditable): string {
  return linea.producto?.descripcion ?? linea.descripcionPersonalizada ?? '';
}

export interface PresupuestoProductosEditorProps {
  // 'staged' (nuevo) vs 'live' (editar/[id]) — informational for copy/labels;
  // all actual persistence behavior is provided by the injected handlers
  // (Decision A1), keeping this component itself mode-agnostic.
  mode: 'staged' | 'live';
  lines: PresupuestoLineaEditable[];
  onAdd: (productoId: number, cantidad: number, precioUnitario?: number) => Promise<void>;
  onAddCustom: (descripcion: string, cantidad: number, precioUnitario: number) => Promise<void>;
  onUpdate: (lineId: number, cantidad: number, precioUnitario?: number) => Promise<void>;
  onRemove: (lineId: number) => Promise<void>;
  disabled?: boolean;
}

interface ActualizarProductoModalProps {
  linea: PresupuestoLineaEditable | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (linea: PresupuestoLineaEditable, cantidad: number, precioUnitario: number) => void;
}

// Confirm-to-edit modal for an already-added line: cantidad and precio
// unitario are only ever changed together here, replacing the previous
// always-editable inline cantidad input.
function ActualizarProductoModal({ linea, busy, onClose, onConfirm }: ActualizarProductoModalProps) {
  const [cantidadInput, setCantidadInput] = useState('');
  const [precioInput, setPrecioInput] = useState('');

  useEffect(() => {
    if (!linea) return;
    setCantidadInput(linea.cantidad);
    setPrecioInput(linea.precioUnitario);
  }, [linea]);

  const handleGuardar = () => {
    if (!linea) return;
    onConfirm(linea, Number(cantidadInput), Number(precioInput));
  };

  // Cantidad only ever moves in whole units via the -/+ steppers — decimal
  // cantidades don't make sense for discrete stock items.
  const stepCantidad = (delta: number) => {
    const current = Math.floor(Number(cantidadInput)) || 0;
    setCantidadInput(String(Math.max(1, current + delta)));
  };

  return (
    <Modal
      open={linea !== null}
      onClose={onClose}
      title="Actualizar producto"
      titleClassName="text-white"
      headerClassName="-mx-6 -mt-6 rounded-t-xl bg-slate-900 px-6 py-4"
      closeButtonClassName="bg-red-600 text-white hover:bg-red-700"
      maxWidth="max-w-md"
    >
      {linea && (
        <div className="space-y-4">
          <p className="text-lg font-semibold text-stone-900">{lineaDescripcion(linea)}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="actualizar-producto-cantidad" className="block text-center text-sm font-semibold text-black">
                Cantidad
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepCantidad(-1)}
                  disabled={busy}
                  aria-label="Disminuir cantidad"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black bg-slate-900 text-base font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  −
                </button>
                <input
                  id="actualizar-producto-cantidad"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={cantidadInput}
                  onChange={(e) => setCantidadInput(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  disabled={busy}
                  className="w-full min-w-0 rounded-lg border border-black bg-white px-2 py-2 text-center text-sm font-semibold text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => stepCantidad(1)}
                  disabled={busy}
                  aria-label="Aumentar cantidad"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black bg-slate-900 text-base font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="actualizar-producto-precio" className="block text-center text-sm font-semibold text-black">
                Precio unitario
              </label>
              <input
                id="actualizar-producto-precio"
                type="number"
                min={0.01}
                step={0.01}
                value={precioInput}
                onChange={(e) => setPrecioInput(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                disabled={busy}
                className="w-full rounded-lg border border-black bg-white px-3 py-2 text-center text-sm font-semibold text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-black bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={busy}
              className="rounded-lg border border-black bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface ItemPersonalizadoModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (descripcion: string, cantidad: number, precioUnitario: number) => void;
}

// Add-a-custom-line modal: free-text descripción (own row, full width) above
// the cantidad/precio pair — same two-column layout as ActualizarProductoModal.
function ItemPersonalizadoModal({ open, busy, onClose, onConfirm }: ItemPersonalizadoModalProps) {
  const [descripcionInput, setDescripcionInput] = useState('');
  const [cantidadInput, setCantidadInput] = useState('1');
  const [precioInput, setPrecioInput] = useState('');

  useEffect(() => {
    if (!open) return;
    setDescripcionInput('');
    setCantidadInput('1');
    setPrecioInput('');
  }, [open]);

  const stepCantidad = (delta: number) => {
    const current = Math.floor(Number(cantidadInput)) || 0;
    setCantidadInput(String(Math.max(1, current + delta)));
  };

  const handleAgregar = () => {
    const descripcion = descripcionInput.trim();
    if (!descripcion) {
      showError('Descripción inválida', 'Ingresá una descripción para el ítem.');
      return;
    }
    const cantidadNum = Number(cantidadInput);
    if (!cantidadInput || Number.isNaN(cantidadNum) || cantidadNum <= 0) {
      showError('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }
    const precioNum = Number(precioInput);
    if (!precioInput || Number.isNaN(precioNum) || precioNum <= 0) {
      showError('Precio inválido', 'Ingresá un precio mayor a 0.');
      return;
    }
    onConfirm(descripcion, cantidadNum, precioNum);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Item personalizado"
      titleClassName="text-white"
      headerClassName="-mx-6 -mt-6 rounded-t-xl bg-slate-900 px-6 py-4"
      closeButtonClassName="bg-red-600 text-white hover:bg-red-700"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="item-personalizado-descripcion" className="block text-sm font-semibold text-black">
            Descripción
          </label>
          <input
            id="item-personalizado-descripcion"
            type="text"
            autoFocus
            value={descripcionInput}
            onChange={(e) => setDescripcionInput(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-black bg-white px-3 py-2 text-sm font-semibold text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="item-personalizado-cantidad" className="block text-center text-sm font-semibold text-black">
              Cantidad
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepCantidad(-1)}
                disabled={busy}
                aria-label="Disminuir cantidad"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black bg-slate-900 text-base font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                −
              </button>
              <input
                id="item-personalizado-cantidad"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={cantidadInput}
                onChange={(e) => setCantidadInput(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                disabled={busy}
                className="w-full min-w-0 rounded-lg border border-black bg-white px-2 py-2 text-center text-sm font-semibold text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => stepCantidad(1)}
                disabled={busy}
                aria-label="Aumentar cantidad"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black bg-slate-900 text-base font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="item-personalizado-precio" className="block text-center text-sm font-semibold text-black">
              Precio unitario
            </label>
            <input
              id="item-personalizado-precio"
              type="number"
              min={0.01}
              step={0.01}
              value={precioInput}
              onChange={(e) => setPrecioInput(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              disabled={busy}
              className="w-full rounded-lg border border-black bg-white px-3 py-2 text-center text-sm font-semibold text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-black bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAgregar}
            disabled={busy}
            className="rounded-lg border border-black bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function PresupuestoProductosEditor({
  mode,
  lines,
  onAdd,
  onAddCustom,
  onUpdate,
  onRemove,
  disabled,
}: PresupuestoProductosEditorProps) {
  const [busyLineaId, setBusyLineaId] = useState<number | null>(null);
  const [editingLinea, setEditingLinea] = useState<PresupuestoLineaEditable | null>(null);
  const [buscarModalOpen, setBuscarModalOpen] = useState(false);
  const [itemPersonalizadoModalOpen, setItemPersonalizadoModalOpen] = useState(false);
  const [busyAddingCustom, setBusyAddingCustom] = useState(false);

  const bloqueada = disabled ?? false;

  const handleConfirmAddCustom = async (descripcion: string, cantidad: number, precioUnitario: number) => {
    if (busyAddingCustom) return;
    setBusyAddingCustom(true);
    try {
      await onAddCustom(descripcion, cantidad, precioUnitario);
      showSuccess('Ítem agregado', `${descripcion} se agregó al presupuesto.`);
      setItemPersonalizadoModalOpen(false);
    } catch (err) {
      showError(
        'No se pudo agregar el ítem',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setBusyAddingCustom(false);
    }
  };

  const handleActualizar = async (linea: PresupuestoLineaEditable, cantidadNum: number, precioNum: number) => {
    if (bloqueada || busyLineaId !== null) return;
    if (Number.isNaN(cantidadNum) || cantidadNum <= 0) {
      showError('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }
    if (Number.isNaN(precioNum) || precioNum <= 0) {
      showError('Precio inválido', 'Ingresá un precio mayor a 0.');
      return;
    }

    setBusyLineaId(linea.id);
    try {
      await onUpdate(linea.id, cantidadNum, precioNum);
      setEditingLinea(null);
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
      text: `¿Confirmás quitar "${lineaDescripcion(linea)}" de este presupuesto?`,
      confirmButtonText: 'Sí, quitar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirmed) return;

    setBusyLineaId(linea.id);
    try {
      await onRemove(linea.id);
      showSuccess('Producto quitado', `${lineaDescripcion(linea)} se quitó del presupuesto.`);
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
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-stone-700">Productos</h3>
        {!bloqueada && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setItemPersonalizadoModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-black bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-white"
            >
              <PlusIcon />
              Item personalizado
            </button>
            <button
              type="button"
              onClick={() => setBuscarModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-black bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-white"
            >
              <SearchIcon />
              Buscar producto
            </button>
          </div>
        )}
      </div>

      <BuscarProductoModal
        open={buscarModalOpen}
        onClose={() => setBuscarModalOpen(false)}
        onAdd={onAdd}
      />

      <ItemPersonalizadoModal
        open={itemPersonalizadoModalOpen}
        busy={busyAddingCustom}
        onClose={() => setItemPersonalizadoModalOpen(false)}
        onConfirm={handleConfirmAddCustom}
      />

      <ActualizarProductoModal
        linea={editingLinea}
        busy={editingLinea !== null && busyLineaId === editingLinea.id}
        onClose={() => setEditingLinea(null)}
        onConfirm={handleActualizar}
      />

      {lines.length === 0 ? (
        <p className="text-sm text-stone-400">
          {mode === 'staged'
            ? 'Todavía no agregaste productos a este presupuesto.'
            : 'Este presupuesto no tiene productos todavía.'}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-stone-200">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Descripción
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Cantidad
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Precio unitario
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Precio total
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {lines.map((linea) => (
                  <tr key={linea.id}>
                    <td className="max-w-0 truncate px-3 py-2 text-sm text-stone-800">
                      {lineaDescripcion(linea)}
                    </td>
                    <td className="px-3 py-2 text-center text-sm text-stone-800">{linea.cantidad}</td>
                    <td className="px-3 py-2 text-center text-sm text-stone-600">
                      {formatMoney(Number(linea.precioUnitario))}
                    </td>
                    <td className="px-3 py-2 text-center text-sm font-semibold text-stone-800">
                      {formatMoney(Number(linea.precioTotal))}
                    </td>
                    <td className="px-3 py-2 text-center text-sm">
                      {!bloqueada && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingLinea(linea)}
                            disabled={busyLineaId === linea.id}
                            className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyLineaId === linea.id ? '...' : 'Actualizar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuitar(linea)}
                            disabled={busyLineaId === linea.id}
                            className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-900 px-5 py-4">
            <span className="text-xl font-semibold uppercase text-white">Total</span>
            <span className="text-xl font-semibold text-white">{formatMoney(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
