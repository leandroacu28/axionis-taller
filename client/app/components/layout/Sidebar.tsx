'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { navigation, type NavigationItem } from '../../lib/navigation';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}

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

function LogoutIcon() {
  return (
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
  );
}

function isItemActive(item: NavigationItem, pathname: string | null): boolean {
  if (item.href) {
    return pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false);
  }
  return item.children?.some((child) => isItemActive(child, pathname)) ?? false;
}

// Narrows the nav tree to items whose name matches `query`, keeping a parent
// when it matches directly (all its children stay) or when only some of its
// children match (only those survive) — a leaf item survives on its own match.
function filterNavigation(items: NavigationItem[], query: string): NavigationItem[] {
  if (!query) return items;

  return items.reduce<NavigationItem[]>((acc, item) => {
    const selfMatches = item.name.toLowerCase().includes(query);

    if (item.children) {
      if (selfMatches) {
        acc.push(item);
        return acc;
      }
      const matchingChildren = filterNavigation(item.children, query);
      if (matchingChildren.length > 0) {
        acc.push({ ...item, children: matchingChildren });
      }
      return acc;
    }

    if (selfMatches) acc.push(item);
    return acc;
  }, []);
}

export function Sidebar({ sidebarOpen, setSidebarOpen, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredNavigation = filterNavigation(navigation, normalizedQuery);
  const isSearching = normalizedQuery.length > 0;

  // Auto-expand any group that contains the active route.
  useEffect(() => {
    navigation.forEach((item) => {
      if (item.children && isItemActive(item, pathname) && !openGroups.includes(item.id)) {
        setOpenGroups((prev) => [...prev, item.id]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const linkClasses = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-colors duration-200 ${
      active ? 'bg-white/10 text-rose-400' : 'text-gray-300 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-16 z-30 flex h-[calc(100vh-4rem)] w-64 flex-col border-r border-slate-800 bg-slate-900 shadow-lg transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-slate-800 px-3 py-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <SearchIcon />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar sección..."
              aria-label="Buscar sección"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-base text-white placeholder:text-gray-500 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            />
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {filteredNavigation.length === 0 && (
            <p className="px-3 py-2 text-base text-gray-500">No se encontraron secciones.</p>
          )}
          {filteredNavigation.map((item) => {
            if (item.children) {
              const isOpen = isSearching || openGroups.includes(item.id);
              const active = isItemActive(item, pathname);

              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.id)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-base font-medium transition-colors duration-200 ${
                      active ? 'text-rose-400' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.name}</span>
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="mt-1 space-y-1 pl-4">
                      {item.children.map((child) => (
                        <Link
                          key={child.id}
                          href={child.href ?? '#'}
                          onClick={() => setSidebarOpen(false)}
                          className={linkClasses(isItemActive(child, pathname))}
                        >
                          {child.icon}
                          <span>{child.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href ?? '#'}
                onClick={() => setSidebarOpen(false)}
                className={linkClasses(isItemActive(item, pathname))}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-rose-600 px-3 py-2 text-base font-medium text-white"
          >
            <LogoutIcon />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
