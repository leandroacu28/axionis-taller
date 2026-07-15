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
      {
        name: 'Colores',
        href: '/colores',
        id: 'colores',
        icon: <img src="/icons/colores.svg" alt="" className="h-5 w-5" aria-hidden />,
      },
      {
        name: 'Marcas',
        href: '/marcas',
        id: 'marcas',
        icon: <img src="/icons/marcas.svg" alt="" className="h-5 w-5" aria-hidden />,
      },
      {
        name: 'Tipos de Servicio',
        href: '/tipos-servicio',
        id: 'tipos-servicio',
        icon: <img src="/icons/tipos-servicio.svg" alt="" className="h-5 w-5" aria-hidden />,
      },
      {
        name: 'Unidades de Medida',
        href: '/unidades-medida',
        id: 'unidades-medida',
        icon: <img src="/icons/configuraciones.svg" alt="" className="h-5 w-5" aria-hidden />,
      },
      {
        name: 'Etiquetas',
        href: '/etiquetas',
        id: 'etiquetas',
        icon: <img src="/icons/etiquetas.svg" alt="" className="h-5 w-5" aria-hidden />,
      },
    ],
  },
  {
    name: 'Clientes',
    href: '/clientes',
    id: 'clientes',
    icon: <img src="/icons/clientes.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Vehículos',
    href: '/vehiculos',
    id: 'vehiculos',
    icon: <img src="/icons/vehiculos.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
  {
    name: 'Productos',
    href: '/productos',
    id: 'productos',
    icon: <img src="/icons/productos.svg" alt="" className="h-5 w-5" aria-hidden />,
  },
];
