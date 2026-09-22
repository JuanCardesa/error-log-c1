import { getDb } from '@/lib/db/client';
import { loadAnkiDataset, loadDataset } from '@/lib/db/load';
import { isCsvExport, toCsvExport, toJsonDump } from '@/lib/export/dump';
import { parseWindow } from '../../_shared/window';

/**
 * Descargas. Un fichero por query, mas el volcado completo.
 *
 * El nombre del fichero es la ruta (`/exportar/q1.csv`) para que el navegador lo guarde
 * ya con un nombre util, sin tener que negociarlo en la cabecera.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await context.params;
  const windowDays = parseWindow(new URL(request.url).searchParams.get('w') ?? undefined);

  const data = loadDataset(getDb());
  const anki = loadAnkiDataset(getDb());
  const options = { now: new Date(), windowDays };

  if (file === 'dump.json') {
    return Response.json(toJsonDump(data, options, anki), {
      headers: { 'content-disposition': 'attachment; filename="errorlog-dump.json"' },
    });
  }

  const match = /^(q[1-7])\.csv$/.exec(file);
  const which = match?.[1];
  if (which === undefined || !isCsvExport(which)) {
    return new Response('No existe ese fichero.', { status: 404 });
  }

  // La marca UTF-8 debe estar en el cuerpo, no basta con declarar el charset.
  return new Response(`\uFEFF${toCsvExport(which, data, options, anki)}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="errorlog-${which}.csv"`,
    },
  });
}
