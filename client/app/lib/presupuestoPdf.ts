import * as pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';
import { API_BASE_URL } from './api';
import { getUser } from './auth';
import { getEmpresa } from './empresa';
import type { PresupuestoListItem } from './presupuestos';

pdfMake.addVirtualFileSystem(vfs);

function formatFecha(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCantidad(value: string): string {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

async function fetchLogoDataUrl(logoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${logoUrl}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generatePresupuestoPdf(presupuesto: PresupuestoListItem): Promise<void> {
  const empresa = await getEmpresa();
  const user = getUser();
  const logoDataUrl = empresa.logoUrl ? await fetchLogoDataUrl(empresa.logoUrl) : null;

  const generadoPor = user ? [user.nombre, user.apellido].filter(Boolean).join(' ') || user.username : '—';
  const total = presupuesto.productos.reduce((sum, linea) => sum + Number(linea.precioTotal), 0);

  const productoRows = presupuesto.productos.map((linea) => [
    { text: linea.producto?.descripcion ?? linea.descripcionPersonalizada ?? '' },
    { text: formatCantidad(linea.cantidad), alignment: 'center' as const },
    { text: formatMoney(Number(linea.precioTotal)), alignment: 'right' as const },
  ]);

  pdfMake
    .createPdf({
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      content: [
        {
          columns: [
            logoDataUrl ? { image: logoDataUrl, width: 150 } : { text: '' },
            {
              width: '*',
              alignment: 'right',
              stack: [
                { text: empresa.nombre ?? 'Presupuesto', style: 'empresaNombre' },
                ...(empresa.direccion ? [{ text: empresa.direccion, style: 'empresaDato' }] : []),
                ...(empresa.telefono ? [{ text: empresa.telefono, style: 'empresaDato' }] : []),
              ],
            },
          ],
        },
        {
          columns: [
            { text: `Fecha: ${formatFecha(presupuesto.fecha)}`, style: 'meta' },
            { text: `Presupuesto N°: ${presupuesto.id}`, style: 'meta', alignment: 'right' },
          ],
          margin: [0, 16, 0, 0],
        },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#d1d5db' }],
          margin: [0, 8, 0, 12],
        },
        {
          stack: [
            { text: `Cliente: ${presupuesto.cliente.razonSocial}`, style: 'info' },
            { text: `Generado por: ${generadoPor}`, style: 'info' },
            { text: `Tipo de servicio: ${presupuesto.tipoServicio.descripcion}`, style: 'info' },
            ...(presupuesto.descripcion ? [{ text: `Descripción: ${presupuesto.descripcion}`, style: 'info' }] : []),
          ],
          margin: [0, 0, 0, 16],
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 70, 90],
            body: [
              [
                { text: 'Descripción', style: 'tableHeader' },
                { text: 'Cantidad', style: 'tableHeader', alignment: 'center' },
                { text: 'Total', style: 'tableHeader', alignment: 'right' },
              ],
              ...productoRows,
            ],
          },
          layout: {
            fillColor: (rowIndex: number) => (rowIndex === 0 ? '#f5f5f4' : null),
            hLineColor: () => '#e7e5e4',
            vLineColor: () => '#e7e5e4',
          },
        },
        {
          text: `Total: ${formatMoney(total)}`,
          style: 'total',
          alignment: 'right',
          margin: [0, 12, 0, 0],
        },
      ],
      styles: {
        empresaNombre: { fontSize: 22, bold: true },
        empresaDato: { fontSize: 13, color: '#57534e' },
        meta: { fontSize: 15, bold: true },
        info: { fontSize: 14, margin: [0, 3, 0, 0] },
        tableHeader: { bold: true, fontSize: 14 },
        total: { fontSize: 18, bold: true },
      },
      defaultStyle: { fontSize: 13 },
    })
    .open();
}
