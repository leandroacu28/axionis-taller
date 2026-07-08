import { ReactNode } from 'react';

/**
 * `href` is optional: a group item (e.g. "Configuraciones Generales") has no
 * page of its own — it only exists to hold `children` and render as a
 * collapsible group in the Sidebar. Leaf items always set `href`.
 */
export type NavigationItem = {
  name: string;
  href?: string;
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
    name: 'Configuraciones Generales',
    id: 'configuraciones',
    icon: <img src="/icons/configuraciones.svg" alt="" className="h-5 w-5" aria-hidden />,
    children: [
      {
        name: 'Usuarios',
        href: '/usuarios',
        id: 'usuarios',
        icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
      },
    ],
  },
];
