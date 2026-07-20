'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { iniciarOrdenTrabajo, updateOrdenTrabajo, type OrdenTrabajoListItem } from '../../../lib/ordenes-trabajo';
import { showConfirm, showError, showSuccess } from '../../../lib/alerts';

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
    <div className="flex flex-wrap gap-1.5 border-t border-stone-100 pt-2">
      {orden.estado !== 'cancelado' && (
        <button
          type="button"
          onClick={handleIniciar}
          disabled={iniciando}
          className="flex-1 rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-2 py-1.5 text-center text-xs font-semibold text-white shadow-sm transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {iniciando ? 'Iniciando...' : 'Iniciar trabajo'}
        </button>
      )}

      <Link
        href={`/ordenes-trabajo/editar/${orden.id}`}
        className="flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-center text-xs font-semibold text-stone-600 transition-all hover:bg-stone-50"
      >
        Editar
      </Link>

      <button
        type="button"
        onClick={handleDesactivar}
        disabled={desactivando}
        className="flex-1 rounded-lg border border-rose-200 px-2 py-1.5 text-center text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {desactivando ? 'Desactivando...' : 'Desactivar'}
      </button>
    </div>
  );
}
