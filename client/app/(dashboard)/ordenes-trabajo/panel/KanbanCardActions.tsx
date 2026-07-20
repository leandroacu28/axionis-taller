'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  iniciarOrdenTrabajo,
  updateOrdenTrabajo,
  type OrdenTrabajoListItem,
} from '../../../lib/ordenes-trabajo';
import { showConfirm, showError, showSuccess } from '../../../lib/alerts';

// Re-declared per D3/D7 — mirrors the list page's AccionesMenu icons rather than
// importing them (an import would couple the panel to page.tsx and risk touching
// the untouched list page). Same "duplicate small presentation helpers per
// surface" convention already used in KanbanBoard.tsx.
function EllipsisIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function NoSymbolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

// Same flip estimate as the list page's AccionesMenu — the panel menu also has a
// max of three items (Editar, Iniciar, Desactivar), so the estimate carries over
// unchanged. On a cancelado card the menu is shorter (two items); over-estimating
// only makes the upward-flip trigger slightly earlier, which is safe.
const ACCIONES_MENU_HEIGHT_ESTIMATE = 130;

interface MenuPosition {
  top: number;
  left: number;
  openUpward: boolean;
}

export default function KanbanCardActions({
  orden,
  onActionSuccess,
}: {
  orden: OrdenTrabajoListItem;
  onActionSuccess: () => void;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [desactivando, setDesactivando] = useState(false);

  const closeMenu = () => {
    setOpen(false);
    setMenuPos(null);
  };

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUpward = window.innerHeight - rect.bottom < ACCIONES_MENU_HEIGHT_ESTIMATE;
    setMenuPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.right,
      openUpward,
    });
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (open) {
      closeMenu();
      return;
    }
    openMenu();
  };

  // Mirrors IniciarTrabajoButton.handleClick (page.tsx). The API call fires
  // only on a pendiente order; every other visible estado (en_proceso,
  // terminado) is pure navigation — a second iniciar would 409. No
  // confirmation dialog in either branch.
  const handleIniciar = async () => {
    closeMenu();
    if (orden.estado === 'pendiente') {
      setIniciando(true);
      try {
        await iniciarOrdenTrabajo(orden.id);
        onActionSuccess(); // re-fetch (D4) — fire before navigating, as the list page does
      } catch (err) {
        showError(
          'No se pudo iniciar la orden',
          err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
        );
        setIniciando(false);
        return; // do NOT navigate on failure
      }
      setIniciando(false);
    }
    router.push(`/ordenes-trabajo/${orden.id}/trabajo`);
  };

  // Mirrors AccionesMenu.handleToggleActivo, narrowed to the deactivate-only
  // direction (ADR-E). Full-object resend + activo:false (D8), assembled
  // entirely from the card's own OrdenTrabajoListItem — no getOrdenTrabajo(id)
  // prefetch required (ADR-C).
  const handleDesactivar = async () => {
    closeMenu();
    const confirmed = await showConfirm({
      title: 'Desactivar orden',
      text: `¿Seguro que querés desactivar la orden ${orden.numero ?? ''}?`,
      confirmButtonText: 'Sí, desactivar',
      confirmButtonColor: '#e11d48',
    });
    if (!confirmed) return; // cancel → no API call, card unchanged

    setDesactivando(true);
    try {
      await updateOrdenTrabajo(orden.id, {
        fechaIngreso: orden.fechaIngreso,
        kilometros: orden.kilometros,
        prioridad: orden.prioridad,
        motivoIngreso: orden.motivoIngreso,
        estado: orden.estado,
        clienteId: orden.cliente.id,
        vehiculoId: orden.vehiculo.id,
        mecanicoId: orden.mecanico.id,
        tipoServicioIds: orden.tiposServicio.map((t) => t.id),
        activo: false,
      });
      showSuccess('Orden desactivada', `La orden ${orden.numero ?? ''} se desactivó correctamente.`);
      onActionSuccess(); // re-fetch → deactivated card vanishes (D6)
    } catch (err) {
      showError(
        'No se pudo actualizar la orden',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
      // NO onActionSuccess() on failure (spec: failed PATCH must not trigger a re-fetch)
    } finally {
      setDesactivando(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) closeMenu();
    };
    const handleReposition = () => closeMenu();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true); // capture: closes on ANY scroll, incl. the board's overflow-x-auto
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acciones"
        className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      >
        <EllipsisIcon />
      </button>

      {open &&
        menuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: `translateX(-100%)${menuPos.openUpward ? ' translateY(-100%)' : ''}`,
            }}
            className="z-50 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
          >
            <Link
              href={`/ordenes-trabajo/editar/${orden.id}`}
              onClick={closeMenu}
              className="block px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Editar
            </Link>

            {orden.estado !== 'cancelado' && (
              <button
                type="button"
                onClick={handleIniciar}
                disabled={iniciando}
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {iniciando ? 'Iniciando...' : 'Iniciar trabajo'}
              </button>
            )}

            <button
              type="button"
              onClick={handleDesactivar}
              disabled={desactivando}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <NoSymbolIcon />
              Desactivar
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
