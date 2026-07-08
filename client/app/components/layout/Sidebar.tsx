'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { navigation, type NavigationItem } from '../../lib/navigation';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

function isItemActive(item: NavigationItem, pathname: string | null): boolean {
  if (item.href) {
    return pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false);
  }
  return item.children?.some((child) => isItemActive(child, pathname)) ?? false;
}

export function Sidebar({ sidebarOpen, setSidebarOpen }: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>([]);

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
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
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
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            if (item.children) {
              const isOpen = openGroups.includes(item.id);
              const active = isItemActive(item, pathname);

              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.id)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
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
      </aside>
    </>
  );
}
