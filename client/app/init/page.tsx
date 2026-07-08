'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '../lib/api';

type Status = 'idle' | 'loading' | 'success' | 'conflict' | 'error';

export default function InitPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const handleInit = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/init`, {
        method: 'POST',
      });

      if (response.status === 201) {
        setStatus('success');
        router.push('/login');
        return;
      }

      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        setStatus('conflict');
        setMessage(data?.message ?? 'El usuario maestro ya fue inicializado.');
        setTimeout(() => {
          router.push('/login');
        }, 1500);
        return;
      }

      setStatus('error');
      setMessage('Ocurrió un error inesperado al inicializar el sistema.');
    } catch {
      setStatus('error');
      setMessage('No se pudo conectar con el servidor.');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-2xl shadow-gray-300/50">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-stone-800">
            Axionis <span className="text-rose-500">Taller Mecánico</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            Creá el usuario maestro para poder acceder al sistema por
            primera vez.
          </p>
        </div>

        <button
          onClick={handleInit}
          disabled={status === 'loading'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'loading' && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            />
          )}
          {status === 'loading' ? 'Inicializando...' : 'Inicializar sistema'}
        </button>

        {status === 'conflict' && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {message} Redirigiendo al login...
          </div>
        )}

        {status === 'error' && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}
