'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { UserData } from '../../lib/auth';
import { navigation, type NavigationItem } from '../../lib/navigation';
import { ThemeToggle } from '../ThemeToggle';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  user: UserData | null;
  onLogout: () => void;
}

type FlatNavItem = {
  id: string;
  name: string;
  href: string;
  icon: NavigationItem['icon'];
  groupName?: string;
};

// Only leaf items (the ones with an `href`) are navigable, so groups like
// "Configuraciones" get expanded into their children here instead of
// appearing as a search result themselves.
function flattenNavigation(items: NavigationItem[], groupName?: string): FlatNavItem[] {
  return items.flatMap((item) => {
    if (item.children) {
      return flattenNavigation(item.children, item.name);
    }
    if (!item.href) return [];
    return [{ id: item.id, name: item.name, href: item.href, icon: item.icon, groupName }];
  });
}

const flatNavigation = flattenNavigation(navigation);

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
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
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? flatNavigation.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
    : [];

  useEffect(() => {
    if (!isSearchOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearchOpen]);

  const closeSearch = () => {
    setQuery('');
    setIsSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 shadow-sm md:px-6">
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="rounded-lg p-2 text-gray-300 transition-colors duration-200 hover:bg-white/10 hover:text-white"
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

      <span className="text-xl font-bold text-white">Axionis Taller</span>

      <div className="flex-1" />

      <div className="relative hidden sm:block" ref={searchRef}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsSearchOpen(true);
          }}
          onFocus={() => setIsSearchOpen(true)}
          placeholder="Buscar sección..."
          aria-label="Buscar sección"
          className="w-56 rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-base text-white placeholder:text-gray-500 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        />
        {isSearchOpen && normalizedQuery && (
          <div className="absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-lg">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No se encontraron secciones.</p>
            ) : (
              searchResults.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={closeSearch}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 hover:text-white"
                >
                  {item.icon}
                  <span>{item.name}</span>
                  {item.groupName && (
                    <span className="ml-auto text-xs text-gray-500">{item.groupName}</span>
                  )}
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <ThemeToggle className="rounded-full p-2 text-gray-300 hover:bg-white/10 hover:text-white" />

      <div className="flex items-center gap-3 border-l border-white/10 pl-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-base font-semibold text-white shadow-md ring-2 ring-white/20">
          {initials}
        </div>
        <div className="hidden flex-col sm:flex">
          <span className="text-base font-semibold text-white">
            {displayName}
          </span>
          {user?.rol && (
            <span
              className={`w-fit rounded-full px-2 py-0.5 text-sm ${
                // Same violet used for the "maestro" role badge in usuarios/page.tsx.
                user.rol === 'maestro'
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-white/10 text-gray-300'
              }`}
            >
              {user.rol}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg p-2 text-gray-300 transition-colors duration-200 hover:bg-white/10 hover:text-rose-400"
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
