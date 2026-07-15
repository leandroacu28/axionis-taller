'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createOrdenServicio, type CreateOrdenServicioPayload } from '../../../lib/ordenes-servicio';
import { showError, showSuccess } from '../../../lib/alerts';
import OrdenServicioForm, { type OrdenServicioFormValues } from '../OrdenServicioForm';

function todayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const EMPTY_FORM: OrdenServicioFormValues = {
  clienteId: '',
  vehiculoId: '',
  mecanicoId: '',
  tiposServicio: [],
  prioridad: 'normal',
  estado: 'pendiente',
  fechaIngreso: todayDateString(),
  kilometros: '',
  motivoIngreso: '',
};

export default function NuevaOrdenServicioPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (payload: CreateOrdenServicioPayload) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await createOrdenServicio(payload);
      showSuccess('Orden creada', 'La orden de servicio ha sido creada correctamente.');
      router.push('/ordenes-servicio');
    } catch (err) {
      showError(
        'Error al crear la orden',
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
          Nueva orden de servicio
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Completá los datos para registrar el ingreso de un vehículo.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <OrdenServicioForm
          mode="create"
          initialValues={EMPTY_FORM}
          submitting={submitting}
          submitLabel="Crear orden"
          submittingLabel="Creando..."
          cancelHref="/ordenes-servicio"
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
