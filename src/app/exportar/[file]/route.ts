import { Readable } from 'node:stream';

import { ZipFile } from 'yazl';

import { getDb } from '@/lib/db/client';
import { loadAnkiDataset, loadDataset } from '@/lib/db/load';
import { notebookDumpChunks, notebookZipEntries } from '@/lib/db/notebookExport';
import { getNotebookNote } from '@/lib/db/notebookRepo';
import { openNotebookSnapshot, type NotebookSnapshot } from '@/lib/db/notebookSnapshot';
import { isCsvExport, toCsvExport, toJsonDump } from '@/lib/export/dump';
import { notebookNoteFileName, notebookNoteToMarkdown } from '@/lib/notebook/export';
import { parseWindow } from '../../_shared/window';

/**
 * Descargas. Un fichero por query, mas el volcado completo.
 *
 * El nombre del fichero es la ruta (`/exportar/q1.csv`) para que el navegador lo guarde
 * ya con un nombre util, sin tener que negociarlo en la cabecera.
 *
 * El cuaderno y el volcado completo se leen de una copia temporal de la base: una descarga
 * larga no debe mezclar el estado de antes y el de despues de seguir escribiendo.
 */

export const dynamic = 'force-dynamic';

/** Cierra la copia temporal termine bien, falle o cancele el navegador. */
function cleanupWith(snapshot: NotebookSnapshot, stream: Readable, signal: AbortSignal): void {
  const close = () => { snapshot.close(); };
  stream.once('close', close);
  stream.once('error', close);
  signal.addEventListener('abort', () => { stream.destroy(); snapshot.close(); }, { once: true });
}

async function notebookZip(signal: AbortSignal): Promise<Response> {
  const snapshot = await openNotebookSnapshot();
  const zip = new ZipFile();
  try {
    for (const entry of notebookZipEntries(snapshot.db, new Date())) {
      if (entry.kind === 'directory') {
        zip.addEmptyDirectory(entry.path, { mtime: entry.mtime });
        continue;
      }
      // Lazy: el cuerpo se lee de la copia cuando el ZIP llega a esa entrada, no ahora.
      zip.addReadStreamLazy(entry.path, { mtime: entry.mtime, mode: 0o100644 }, (done) => {
        try {
          done(null, Readable.from([Buffer.from(entry.read(), 'utf8')]));
        } catch (error) {
          done(error, Readable.from([]));
        }
      });
    }
    zip.end();
  } catch (error) {
    snapshot.close();
    throw error;
  }
  const output = zip.outputStream as Readable;
  cleanupWith(snapshot, output, signal);
  return new Response(Readable.toWeb(output) as ReadableStream<Uint8Array>, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="errorlog-notebook.zip"',
    },
  });
}

async function fullDump(signal: AbortSignal, now: Date): Promise<Response> {
  const snapshot = await openNotebookSnapshot();
  let stream: Readable;
  try {
    const head = toJsonDump(loadDataset(snapshot.db), now, loadAnkiDataset(snapshot.db));
    stream = Readable.from(notebookDumpChunks(snapshot.db, head));
  } catch (error) {
    snapshot.close();
    throw error;
  }
  cleanupWith(snapshot, stream, signal);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="errorlog-dump.json"',
    },
  });
}

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
    const encodedName = encodeURIComponent(notebookNoteFileName(found))
      .replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(notebookNoteToMarkdown(found), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="notebook-${String(found.id)}.md"; filename*=UTF-8''${encodedName}`,
      },
    });
  }

  if (file === 'notebook.zip') return notebookZip(request.signal);
  if (file === 'dump.json') return fullDump(request.signal, new Date());

  const data = loadDataset(getDb());
  const anki = loadAnkiDataset(getDb());
  const options = { now: new Date(), windowDays };

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
