'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { iniciarOrdenTrabajo, updateOrdenTrabajo, type OrdenTrabajoListItem } from '../../../lib/ordenes-trabajo';
import { showConfirm, showError, showSuccess } from '../../../lib/alerts';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function NoSymbolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  );
}

export default function KanbanCardActions({
  orden,
  onActionSuccess,
}: {
  orden: OrdenTrabajoListItem;
  onActionSuccess: () => void;
}) {
  const router = useRouter();
  const [iniciando, setIniciando] = useState(false);
  const [desactivando, setDesactivando] = useState(false);

  // Mirrors IniciarTrabajoButton.handleClick (page.tsx). The API call fires
  // only on a pendiente order; every other visible estado (en_proceso,
  // terminado) is pure navigation — a second iniciar would 409. No
  // confirmation dialog in either branch.
  const handleIniciar = async () => {
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

  return (
    <div className="grid grid-cols-2 gap-1.5 border-t border-stone-100 pt-2 dark:border-stone-800">
      {orden.estado !== 'cancelado' && (
        <button
          type="button"
          onClick={handleIniciar}
          disabled={iniciando}
          className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-2 py-1.5 text-center text-xs font-semibold text-white shadow-sm transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlayIcon />
          {iniciando ? 'Iniciando...' : 'Iniciar trabajo'}
        </button>
      )}

      <Link
        href={`/ordenes-trabajo/editar/${orden.id}`}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-2 py-1.5 text-center text-xs font-semibold text-stone-600 transition-all hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
      >
        <PencilIcon />
        Editar
      </Link>

      <button
        type="button"
        onClick={handleDesactivar}
        disabled={desactivando}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-2 py-1.5 text-center text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
      >
        <NoSymbolIcon />
        {desactivando ? 'Desactivando...' : 'Desactivar'}
      </button>
    </div>
  );
}
