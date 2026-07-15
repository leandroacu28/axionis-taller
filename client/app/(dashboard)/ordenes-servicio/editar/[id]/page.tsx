'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  getOrdenServicio,
  updateOrdenServicio,
  type CreateOrdenServicioPayload,
} from '../../../../lib/ordenes-servicio';
import { showError, showSuccess } from '../../../../lib/alerts';
import OrdenServicioForm, { type OrdenServicioFormValues } from '../../OrdenServicioForm';

export default function EditarOrdenServicioPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const ordenId = Number(params.id);

  const [initialValues, setInitialValues] = useState<OrdenServicioFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadOrden = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const orden = await getOrdenServicio(ordenId);
        if (cancelled) return;
        const nombreMecanico = `${orden.mecanico.nombre ?? ''} ${orden.mecanico.apellido ?? ''}`.trim();
        setInitialValues({
          clienteId: orden.cliente.id,
          clienteLabel: orden.cliente.razonSocial,
          vehiculoId: orden.vehiculo.id,
          vehiculoLabel: `${orden.vehiculo.marca.marca} ${orden.vehiculo.marca.modelo}`,
          mecanicoId: orden.mecanico.id,
          mecanicoLabel: nombreMecanico || orden.mecanico.username,
          tiposServicio: orden.tiposServicio.map((t) => ({ id: t.id, label: t.descripcion })),
          prioridad: orden.prioridad,
          estado: orden.estado,
          // ISO datetime -> date-only, matching <input type="date">.
          fechaIngreso: orden.fechaIngreso.slice(0, 10),
          kilometros: orden.kilometros,
          motivoIngreso: orden.motivoIngreso,
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOrden();

    return () => {
      cancelled = true;
    };
  }, [ordenId]);

  const handleSubmit = async (payload: CreateOrdenServicioPayload) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await updateOrdenServicio(ordenId, payload);
      showSuccess('Orden actualizada', 'Los cambios se guardaron correctamente.');
      router.push('/ordenes-servicio');
    } catch (err) {
      showError(
        'Error al actualizar la orden',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
          Editar orden de servicio
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {loading ? 'Cargando datos de la orden...' : 'Modificá los datos de la orden.'}
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando orden...
        </div>
      ) : loadError || !initialValues ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError || 'No se pudo cargar la orden.'}</span>
          </div>
          <Link
            href="/ordenes-servicio"
            className="mt-4 inline-block rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <OrdenServicioForm
            mode="edit"
            initialValues={initialValues}
            submitting={submitting}
            submitLabel="Guardar cambios"
            submittingLabel="Guardando..."
            cancelHref="/ordenes-servicio"
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </div>
  );
}
