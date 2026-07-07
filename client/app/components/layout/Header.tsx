'use client';

import type { UserData } from '../../lib/auth';
import { ThemeToggle } from '../ThemeToggle';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  user: UserData | null;
  onLogout: () => void;
}

function resolveDisplayIdentity(user: UserData | null): { initials: string; displayName: string } {
  if (!user) return { initials: '', displayName: '' };
  if (user.nombre && user.apellido) {
    return {
      initials: `${user.nombre[0]}${user.apellido[0]}`.toUpperCase(),
      displayName: `${user.nombre} ${user.apellido}`,
    };
  }
  return { initials: user.username.slice(0, 2).toUpperCase(), displayName: user.username };
}

export function Header({ sidebarOpen, setSidebarOpen, user, onLogout }: HeaderProps) {
  const { initials, displayName } = resolveDisplayIdentity(user);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 md:px-6">
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 md:hidden"
        aria-label="Toggle sidebar"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
        </svg>
      </button>

      <div className="flex-1" />

      <ThemeToggle />

      <div className="flex items-center gap-3 border-l border-gray-200 pl-4 dark:border-gray-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-sm font-semibold text-white">
          {initials}
        </div>
        <div className="hidden flex-col sm:flex">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {displayName}
          </span>
          {user?.rol && (
            <span className="w-fit rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {user.rol}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-rose-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-rose-400"
          aria-label="Cerrar sesión"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15m-3 0l-3-3m0 0l3-3m-3 3H15"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
