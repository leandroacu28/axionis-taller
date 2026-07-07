'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Nunito } from 'next/font/google';
import { login, setToken, setUser } from '../lib/auth';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
});

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(username, password);
      // Drop the legacy localStorage token from before the cookie-based
      // session migration — nothing reads it anymore, but leaving a stale
      // JWT sitting in localStorage indefinitely is an avoidable exposure.
      localStorage.removeItem('access_token');
      setToken(data.access_token);
      setUser(data.user);
      router.push('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className={`${nunito.className} flex min-h-screen w-full overflow-hidden bg-white`}
    >
      {/* Panel izquierdo: Branding (visible en desktop) */}
      <div className="relative hidden items-center justify-center overflow-hidden bg-stone-900 lg:flex lg:w-1/2">
        {/* Fondo con efectos */}
        <div className="absolute inset-0 bg-gradient-to-br from-stone-900 via-rose-950 to-stone-900 opacity-90" />
        <div className="absolute inset-0 bg-grid-pattern opacity-10" />

        {/* Círculos decorativos */}
        <div className="absolute top-0 left-0 h-full w-full overflow-hidden">
          <div className="absolute -top-[10%] -left-[10%] h-[50%] w-[50%] rounded-full bg-rose-600/20 blur-3xl" />
          <div className="absolute top-[40%] -right-[10%] h-[40%] w-[40%] rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-[10%] left-[20%] h-[30%] w-[30%] rounded-full bg-rose-400/10 blur-3xl" />
        </div>

        {/* Contenido branding */}
        <div className="animate-slide-in-left [animation-delay:0.2s] relative z-10 flex max-w-lg flex-col items-center p-12 text-center">
          <Image
            src="/images/axionis-negativo.png"
            alt="Axionis Taller Mecánico"
            width={192}
            height={128}
            priority
            style={{ objectFit: 'contain' }}
            className="mb-6 h-14 w-auto md:h-16"
          />
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white">
            Axionis <span className="text-rose-400">Taller Mecánico</span>
          </h1>

          <p className="mb-8 text-lg leading-relaxed text-stone-300">
            Gestioná órdenes de trabajo, clientes y turnos del taller desde un
            solo lugar.
          </p>

          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-white">100%</span>
              <span className="text-xs uppercase tracking-wider text-stone-400">
                Órdenes de trabajo
              </span>
            </div>
            <div className="h-10 w-px bg-white/20" />
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-white">24/7</span>
              <span className="text-xs uppercase tracking-wider text-stone-400">
                Disponibilidad
              </span>
            </div>
          </div>
        </div>

        {/* Footer copyright */}
        <div className="absolute bottom-6 z-10 w-full text-center text-xs text-stone-500">
          &copy; {new Date().getFullYear()} Axionis Taller Mecánico. Todos los
          derechos reservados.
        </div>
      </div>

      {/* Panel derecho: Formulario */}
      <div className="relative flex w-full flex-col items-center justify-center bg-gray-50/50 p-6 md:p-12 lg:w-1/2">
        {/* Header móvil (visible solo en móvil) */}
        <div className="absolute left-0 top-0 flex w-full items-center justify-between p-6 text-stone-900 lg:hidden">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight">
              Axionis Taller Mecánico
            </span>
          </div>
        </div>

        {/* Contenedor del formulario */}
        <div className="animate-slide-in-right w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-xl md:p-10">
          <div className="mb-8 text-center lg:text-left">
            <h2 className="mb-2 text-3xl font-bold text-stone-800">
              Bienvenido
            </h2>
            <p className="text-stone-500">
              Ingresá tus credenciales para acceder al sistema.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="ml-1 text-sm font-semibold text-stone-700"
              >
                Usuario
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-stone-400 transition-colors group-focus-within:text-rose-500">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Ingresá tu usuario"
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50 py-3.5 pl-11 pr-4 font-medium text-stone-900 transition-all duration-200 placeholder:text-stone-400 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="ml-1 text-sm font-semibold text-stone-700"
              >
                Contraseña
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-stone-400 transition-colors group-focus-within:text-rose-500">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50 py-3.5 pl-11 pr-4 font-medium text-stone-900 transition-all duration-200 placeholder:text-stone-400 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full transform items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-6 py-4 font-bold text-white shadow-lg shadow-rose-500/30 transition-all duration-200 hover:scale-[1.01] hover:from-rose-600 hover:to-red-600 active:scale-[0.99] disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden="true"
                />
              )}
              <span>{loading ? 'Ingresando...' : 'Ingresar'}</span>
              {!loading && (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <svg
                className="h-4 w-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
