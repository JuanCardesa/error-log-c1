import { getDb } from '@/lib/db/client';
import { loadAnkiDataset, loadDataset } from '@/lib/db/load';
import { getNotebookNote } from '@/lib/db/notebookRepo';
import { isCsvExport, toCsvExport, toJsonDump } from '@/lib/export/dump';
import { notebookNoteFileName, notebookNoteToMarkdown } from '@/lib/notebook/export';
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

  // Un apunte se descarga por ID: el sufijo del nombre lo pone la respuesta, no la ruta.
  const note = /^notebook-([1-9]\d*)\.md$/.exec(file);
  if (note !== null) {
    const found = getNotebookNote(getDb(), Number(note[1]));
    if (found === null) return new Response('No existe ese apunte.', { status: 404 });
    return new Response(notebookNoteToMarkdown(found), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${notebookNoteFileName(found)}"`,
      },
    });
  }

  const data = loadDataset(getDb());
  const anki = loadAnkiDataset(getDb());
  const options = { now: new Date(), windowDays };

  if (file === 'dump.json') {
    return Response.json(toJsonDump(data, options.now, anki), {
      headers: { 'content-disposition': 'attachment; filename="errorlog-dump.json"' },
    });
  }

  // La lista de exportaciones manda: el patron solo separa el nombre de la extension.
  const match = /^(q\d+)\.csv$/.exec(file);
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
