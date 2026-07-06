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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900/80 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Axionis <span className="text-amber-500">Taller Mecánico</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Creá el usuario maestro para poder acceder al sistema por
            primera vez.
          </p>
        </div>

        <button
          onClick={handleInit}
          disabled={status === 'loading'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-amber-500/50 disabled:text-slate-900/60"
        >
          {status === 'loading' && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
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
