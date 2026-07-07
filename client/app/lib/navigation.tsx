import { ReactNode } from 'react';

/**
 * Extensible v1 shape. `children` is reserved for future nested/grouped
 * navigation and is unused today — kept optional so adding it later does not
 * break existing consumers (Header/Sidebar).
 */
export type NavigationItem = {
  name: string;
  href: string;
  id: string;
  icon: ReactNode;
  children?: NavigationItem[];
};

export const navigation: NavigationItem[] = [
  {
    name: 'Inicio',
    href: '/home',
    id: 'home',
    icon: <img src="/icons/inicio.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Usuarios',
    href: '/usuarios',
    id: 'usuarios',
    icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Configuraciones Generales',
    href: '/configuraciones-generales',
    id: 'configuraciones',
    icon: <img src="/icons/configuraciones.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
];
