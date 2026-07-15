import { listBrands, createBrand } from '../../lib/brands';
import { listColors, createColor } from '../../lib/colors';
import { listCustomers, createCustomer, ID_TYPES, ID_TYPE_LABELS, toIdType } from '../../lib/customers';
import { searchUsers } from '../../lib/users';
import type { Option } from './SearchableSelect';
import type { QuickCreateField } from './QuickCreateModal';

interface ReferenceSelectConfig {
  search: (term: string) => Promise<Option[]>;
  create?: (values: Record<string, string>) => Promise<Option>;
  quickCreate?: {
    title: string;
    entityLabel: string;
    fields: QuickCreateField[];
    prefillField?: string;
    successTitle: string;
    successText: string;
  };
}

export const marcaSelectConfig: ReferenceSelectConfig = {
  search: async (term) => {
    const result = await listBrands({
      search: term || undefined,
      status: 'activo',
      page: 1,
      pageSize: 20,
    });
    return result.data.map((brand) => ({ id: brand.id, label: `${brand.marca} ${brand.modelo}` }));
  },
  create: async (values) => {
    const brand = await createBrand({ marca: values.marca, modelo: values.modelo });
    return { id: brand.id, label: `${brand.marca} ${brand.modelo}` };
  },
  quickCreate: {
    title: 'Nueva marca',
    entityLabel: 'marca',
    fields: [
      { name: 'marca', label: 'Marca', type: 'text', required: true, placeholder: 'Ej: Toyota' },
      { name: 'modelo', label: 'Modelo', type: 'text', required: true, placeholder: 'Ej: Corolla' },
    ],
    prefillField: 'marca',
    successTitle: 'Marca creada',
    successText: 'La marca ha sido creada correctamente.',
  },
};

export const colorSelectConfig: ReferenceSelectConfig = {
  search: async (term) => {
    const result = await listColors({
      search: term || undefined,
      status: 'activo',
      page: 1,
      pageSize: 20,
    });
    return result.data.map((color) => ({ id: color.id, label: color.descripcion }));
  },
  create: async (values) => {
    const color = await createColor({ descripcion: values.descripcion });
    return { id: color.id, label: color.descripcion };
  },
  quickCreate: {
    title: 'Nuevo color',
    entityLabel: 'color',
    fields: [
      {
        name: 'descripcion',
        label: 'Descripción',
        type: 'text',
        required: true,
        placeholder: 'Ej: Rojo',
      },
    ],
    prefillField: 'descripcion',
    successTitle: 'Color creado',
    successText: 'El color ha sido creado correctamente.',
  },
};

export const clienteSelectConfig: ReferenceSelectConfig = {
  search: async (term) => {
    const result = await listCustomers({
      search: term || undefined,
      status: 'activo',
      page: 1,
      pageSize: 20,
    });
    return result.data.map((customer) => ({ id: customer.id, label: customer.razonSocial }));
  },
  create: async (values) => {
    const customer = await createCustomer({
      razonSocial: values.razonSocial,
      tipoIdentificacion: toIdType(values.tipoIdentificacion),
      identificacion: values.identificacion,
      telefono: values.telefono,
      domicilio: values.domicilio,
    });
    return { id: customer.id, label: customer.razonSocial };
  },
  quickCreate: {
    title: 'Nuevo cliente',
    entityLabel: 'cliente',
    fields: [
      {
        name: 'razonSocial',
        label: 'Cliente / Razón social',
        type: 'text',
        required: true,
        placeholder: 'Ej: Juan Pérez',
      },
      {
        name: 'tipoIdentificacion',
        label: 'Tipo de identificación',
        type: 'select',
        required: true,
        options: ID_TYPES.map((tipo) => ({ value: tipo, label: ID_TYPE_LABELS[tipo] })),
        defaultValue: ID_TYPES[0],
      },
      {
        name: 'identificacion',
        label: 'Identificación',
        type: 'text',
        placeholder: 'Ej: 20123456789',
      },
      { name: 'telefono', label: 'Teléfono', type: 'text', placeholder: 'Ej: 1145678900' },
      {
        name: 'domicilio',
        label: 'Domicilio',
        type: 'text',
        placeholder: 'Ej: Av. Siempre Viva 742',
      },
    ],
    prefillField: 'razonSocial',
    successTitle: 'Cliente creado',
    successText: 'El cliente ha sido creado correctamente.',
  },
};

// Search-only — no `create`/`quickCreate` (a mecánico is just any active
// User, D6). Backed by `searchUsers`, which already restricts results to
// active users, mirroring the other configs' active-only search.
export const mecanicoSelectConfig: ReferenceSelectConfig = {
  search: async (term) => searchUsers(term),
};
