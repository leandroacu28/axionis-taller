import { ReactNode } from 'react';

/**
 * `href` is optional: a group item (e.g. "Configuraciones") has no
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
    name: 'Configuraciones',
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
  {
    name: 'Clientes',
    href: '/clientes',
    id: 'clientes',
    // No dedicated /icons/clientes.svg asset exists yet; reuse the
    // usuarios icon rather than ship a broken image (see design.md).
    icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Colores',
    href: '/colores',
    id: 'colores',
    // No dedicated /icons/colores.svg asset exists yet; reuse the
    // usuarios icon rather than ship a broken image, same as Clientes above.
    icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Marcas',
    href: '/marcas',
    id: 'marcas',
    // No dedicated /icons/marcas.svg asset exists yet; reuse the
    // usuarios icon rather than ship a broken image, same as Colores above.
    icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Vehículos',
    href: '/vehiculos',
    id: 'vehiculos',
    // No dedicated /icons/vehiculos.svg asset exists yet; reuse the
    // usuarios icon rather than ship a broken image, same as Marcas above.
    icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Tipos de Servicio',
    href: '/tipos-servicio',
    id: 'tipos-servicio',
    // No dedicated /icons/tipos-servicio.svg asset exists yet; reuse the
    // usuarios icon rather than ship a broken image, same as Vehículos above.
    icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
];
