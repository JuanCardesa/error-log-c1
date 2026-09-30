import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type nextFactory from 'next';

import { createDb, type Db } from './client';
import { loadDataset } from './load';
import { migrate } from './migrate';
import { growNotebookFixture, notebookFixtureMarker, type NotebookFixtureSummary } from './notebookFixtures';
import { listNotebookFolders, listNotebookNotes, listRecentNotebookNotes } from './notebookRepo';
import { searchNotebookHits, searchNotebookNotes } from './notebookSearch';
import { seed } from './seed';

/**
 * Banco de medidas de Notebook (TASK 7.2): `pnpm build && pnpm bench:notebook`.
 *
 * Crece un cuaderno sintético a 50, 500 y 5.000 apuntes en una base temporal y, en cada
 * tamaño, mide la búsqueda dentro del proceso (el SQL aparte) y las páginas y descargas
 * contra el servidor de producción de verdad. No toca `data/errorlog.db`.
 *
 * No es una prueba: los tiempos dependen del equipo. Lo que vigilan las pruebas son las
 * cotas que no dependen del reloj (filas leídas, bytes parseados); esto da las cifras.
 *
 * El servidor corre en un proceso hijo: la memoria de la exportación es solo la suya, sin
 * el cuaderno que el banco acaba de generar, y al terminar suelta la base temporal (en
 * Windows no se puede borrar un fichero que otro proceso tiene abierto).
 *
 * Opciones: `--sizes 50,500` · `--runs 15` · `--json resultados.json`.
 */

const ROOT = process.cwd();
const requireNext = createRequire(import.meta.url);

interface Options {
  readonly sizes: readonly number[];
  readonly runs: number;
  readonly json: string | null;
}

function parseOptions(argv: readonly string[]): Options {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index < 0 ? undefined : argv[index + 1];
  };
  const sizes = (value('--sizes') ?? '50,500,5000').split(',').map(Number);
  if (sizes.some((size) => !Number.isSafeInteger(size) || size < 1)) throw new Error('--sizes espera enteros: 50,500,5000');
  const runs = Number(value('--runs') ?? '15');
  if (!Number.isSafeInteger(runs) || runs < 3) throw new Error('--runs espera un entero mayor que 2');
  return { sizes: [...sizes].sort((a, b) => a - b), runs, json: value('--json') ?? null };
}

interface Stats {
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

function stats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { median: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

/** Dos vueltas de calentamiento que no cuentan: la primera paga JIT y cachés de SQLite. */
async function measure(runs: number, task: () => unknown): Promise<Stats> {
  for (let warm = 0; warm < 2; warm += 1) await task();
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    await task();
    samples.push(performance.now() - start);
  }
  return stats(samples);
}

interface Download {
  readonly ms: number;
  readonly bytes: number;
  readonly peakRssDeltaMiB: number;
  readonly peakHeapDeltaMiB: number;
}

type ServerMessage =
  | { readonly type: 'ready'; readonly port: number }
  | { readonly type: 'marked' }
  | { readonly type: 'peak'; readonly rss: number; readonly heapUsed: number };

/** Pide algo al servidor y espera la respuesta de ese tipo. */
function ask<T extends ServerMessage['type']>(
  child: ChildProcess,
  request: { readonly type: 'mark' | 'peak' },
  reply: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((done) => {
    const listen = (message: ServerMessage) => {
      if (message.type !== reply) return;
      child.off('message', listen);
      done(message as Extract<ServerMessage, { type: T }>);
    };
    child.on('message', listen);
    child.send(request);
  });
}

/** Descarga completa leyendo por trozos; el servidor apunta su pico de memoria mientras dura. */
async function download(child: ChildProcess, url: string): Promise<Download> {
  await ask(child, { type: 'mark' }, 'marked');
  const start = performance.now();
  let bytes = 0;
  const response = await fetch(url);
  if (!response.ok || response.body === null) throw new Error(`${url} respondió ${String(response.status)}`);
  for await (const chunk of response.body) bytes += (chunk as Uint8Array).byteLength;
  const ms = performance.now() - start;
  const peak = await ask(child, { type: 'peak' }, 'peak');
  const mib = (value: number) => value / 1024 / 1024;
  return { ms, bytes, peakRssDeltaMiB: mib(peak.rss), peakHeapDeltaMiB: mib(peak.heapUsed) };
}

async function get(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} respondió ${String(response.status)}`);
  await response.arrayBuffer();
}

interface Probe {
  readonly name: string;
  readonly stats: Stats;
}

interface SizeReport {
  readonly fixture: NotebookFixtureSummary;
  readonly growMs: number;
  readonly search: ReadonlyArray<Probe & { readonly sqlMs: number; readonly pageKiB: number }>;
  readonly lists: readonly Probe[];
  readonly pages: readonly Probe[];
  readonly exports: ReadonlyArray<{ readonly name: string } & Download>;
}

const QUERIES = [
  { name: 'frase común «must have»', query: 'must have' },
  { name: 'palabra común «inversion»', query: 'inversion' },
  { name: 'acentos «deducción»', query: 'deducción' },
  { name: 'dos letras «ha»', query: 'ha' },
  { name: 'sin resultados', query: 'zzqx nada' },
] as const;

function noteBySize(db: Db, order: 'median' | 'largest'): { id: number; title: string; kib: number } {
  const count = db.$client.prepare<[], { total: number }>('SELECT count(*) AS total FROM notebook_note').get()?.total ?? 0;
  const offset = order === 'largest' ? 0 : Math.floor(count / 2);
  const row = db.$client.prepare<[number], { id: number; title: string; bytes: number }>(`
    SELECT id, title, length(CAST(content_markdown AS BLOB)) AS bytes FROM notebook_note
    ORDER BY bytes DESC, id LIMIT 1 OFFSET ?`).get(offset);
  if (row === undefined) throw new Error('El cuaderno está vacío');
  return { id: row.id, title: row.title, kib: row.bytes / 1024 };
}

function biggestFolder(db: Db): number {
  const row = db.$client.prepare<[], { folder_id: number }>(`
    SELECT folder_id FROM notebook_note WHERE folder_id IS NOT NULL
    GROUP BY folder_id ORDER BY count(*) DESC, folder_id LIMIT 1`).get();
  if (row === undefined) throw new Error('No hay carpetas con apuntes');
  return row.folder_id;
}

/** KiB de Markdown de los resultados de una página: lo que hay que mirar para los fragmentos. */
function pageKiB(db: Db, ids: readonly number[]): number {
  const read = db.$client.prepare<[number], { bytes: number }>(
    'SELECT length(CAST(content_markdown AS BLOB)) AS bytes FROM notebook_note WHERE id = ?');
  return ids.reduce((total, id) => total + (read.get(id)?.bytes ?? 0), 0) / 1024;
}

async function measureSize(
  db: Db, server: ChildProcess, baseUrl: string, size: number, runs: number, errorIds: readonly number[],
): Promise<SizeReport> {
  const growStart = performance.now();
  const fixture = growNotebookFixture(db, size, { errorIds });
  const growMs = performance.now() - growStart;
  db.$client.pragma('wal_checkpoint(TRUNCATE)');

  const rare = { name: 'marcador único', query: notebookFixtureMarker(Math.floor(size / 2)) };
  const search = [];
  for (const { name, query } of [...QUERIES, rare]) {
    const input = { query, folderId: null, tag: null, page: 1 };
    const sql = await measure(runs, () => searchNotebookNotes(db, input));
    const ids = searchNotebookNotes(db, input).items.map((note) => note.id);
    search.push({ name, stats: await measure(runs, () => searchNotebookHits(db, input)), sqlMs: sql.median, pageKiB: pageKiB(db, ids) });
  }

  const folderId = biggestFolder(db);
  const lists: Probe[] = [
    { name: 'carpetas (directorio)', stats: await measure(runs, () => listNotebookFolders(db)) },
    { name: 'recientes (portada)', stats: await measure(runs, () => listRecentNotebookNotes(db)) },
    { name: 'carpeta mayor, página 1', stats: await measure(runs, () => listNotebookNotes(db, folderId, 1)) },
    { name: 'filtro por etiqueta', stats: await measure(runs, () => searchNotebookNotes(db, { query: '', folderId: null, tag: 'grammar', page: 1 })) },
  ];

  const typical = noteBySize(db, 'median');
  const largest = noteBySize(db, 'largest');
  const pageRuns = Math.max(5, Math.ceil(runs / 2));
  const pages: Probe[] = [];
  for (const [name, path] of [
    ['portada', '/notebook'],
    ['carpeta mayor', `/notebook?carpeta=${String(folderId)}`],
    ['búsqueda «must have»', '/notebook?q=must+have'],
    ['búsqueda «ha»', '/notebook?q=ha'],
    [`lector, apunte mediano (${typical.kib.toFixed(1)} KiB)`, `/notebook/${String(typical.id)}`],
    [`lector, apunte mayor (${largest.kib.toFixed(0)} KiB)`, `/notebook/${String(largest.id)}`],
    [`editor, apunte mayor (${largest.kib.toFixed(0)} KiB)`, `/notebook/${String(largest.id)}/editar`],
  ] as const) {
    pages.push({ name, stats: await measure(pageRuns, () => get(`${baseUrl}${path}`)) });
  }

  const exports = [];
  for (const [name, path] of [['ZIP del cuaderno', '/exportar/notebook.zip'], ['volcado JSON', '/exportar/dump.json']] as const) {
    await download(server, `${baseUrl}${path}`);
    exports.push({ name, ...await download(server, `${baseUrl}${path}`) });
  }
  return { fixture, growMs, search, lists, pages, exports };
}

function ms(value: number): string {
  return value < 10 ? value.toFixed(1) : value.toFixed(0);
}

function print(size: number, report: SizeReport): void {
  const { fixture } = report;
  console.log(`\n## ${String(size)} apuntes · ${String(fixture.folders)} carpetas · ${(fixture.markdownBytes / 1024 / 1024).toFixed(1)} MiB de Markdown · ${String(fixture.links)} vínculos`);
  console.log(`\nGenerar el cuaderno hasta este tamaño: ${ms(report.growMs)} ms\n`);
  console.log('| Búsqueda (proceso) | mediana ms | p95 ms | solo SQL ms | KiB de la página |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const probe of report.search) {
    console.log(`| ${probe.name} | ${ms(probe.stats.median)} | ${ms(probe.stats.p95)} | ${ms(probe.sqlMs)} | ${probe.pageKiB.toFixed(0)} |`);
  }
  console.log('\n| Listado (proceso) | mediana ms | p95 ms |');
  console.log('| --- | ---: | ---: |');
  for (const probe of report.lists) console.log(`| ${probe.name} | ${ms(probe.stats.median)} | ${ms(probe.stats.p95)} |`);
  console.log('\n| Página (HTTP, servidor de producción) | mediana ms | p95 ms |');
  console.log('| --- | ---: | ---: |');
  for (const probe of report.pages) console.log(`| ${probe.name} | ${ms(probe.stats.median)} | ${ms(probe.stats.p95)} |`);
  console.log('\n| Exportación (HTTP) | ms | MiB | pico RSS +MiB | pico heap +MiB |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const item of report.exports) {
    console.log(`| ${item.name} | ${ms(item.ms)} | ${(item.bytes / 1024 / 1024).toFixed(1)} | ${item.peakRssDeltaMiB.toFixed(0)} | ${item.peakHeapDeltaMiB.toFixed(0)} |`);
  }
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => { probe.listen(0, '127.0.0.1', done); });
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((done) => { probe.close(() => { done(); }); });
  return port;
}

/**
 * Proceso hijo: sirve la compilación de producción sobre la base temporal y vigila su
 * propia memoria. «mark» recoge la basura y toma la referencia; «peak» devuelve cuánto
 * creció desde entonces.
 */
async function serve(): Promise<void> {
  const port = await freePort();
  const next = requireNext('next') as typeof nextFactory;
  const app = next({ dev: false, hostname: '127.0.0.1', port, dir: ROOT });
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer((request, response) => { void handle(request, response); });
  // Entre tamaños el banco pasa un rato generando apuntes: si el servidor cerrara esa
  // conexión ociosa justo cuando `fetch` la reutiliza, la medida fallaría con ECONNRESET.
  server.keepAliveTimeout = 0;
  await new Promise<void>((done) => { server.listen(port, '127.0.0.1', done); });

  const gc =(globalThis as { gc?: () => void }).gc;
  let base = process.memoryUsage();
  let peak = { rss: base.rss, heapUsed: base.heapUsed };
  const sample = () => {
    const now = process.memoryUsage();
    peak = { rss: Math.max(peak.rss, now.rss), heapUsed: Math.max(peak.heapUsed, now.heapUsed) };
  };
  const timer = setInterval(sample, 5);
  process.on('message', (message: { readonly type: string }) => {
    if (message.type === 'mark') {
      gc?.();
      base = process.memoryUsage();
      peak = { rss: base.rss, heapUsed: base.heapUsed };
      process.send?.({ type: 'marked' });
    } else if (message.type === 'peak') {
      sample();
      process.send?.({ type: 'peak', rss: peak.rss - base.rss, heapUsed: peak.heapUsed - base.heapUsed });
    } else if (message.type === 'stop') {
      clearInterval(timer);
      server.closeAllConnections();
      server.close(() => { void app.close().finally(() => { process.exit(0); }); });
    }
  });
  process.send?.({ type: 'ready', port });
}

function startServer(file: string): Promise<{ readonly child: ChildProcess; readonly port: number }> {
  const child = fork(fileURLToPath(import.meta.url), ['--serve'], {
    execArgv: ['--expose-gc', '--import', 'tsx'],
    env: { ...process.env, DB_FILE_OVERRIDE: file },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  return new Promise((done, fail) => {
    const early = (code: number | null) => { fail(new Error(`El servidor terminó antes de arrancar (código ${String(code)})`)); };
    child.once('error', fail);
    child.once('exit', early);
    child.on('message', (message: ServerMessage) => {
      if (message.type !== 'ready') return;
      child.off('exit', early);
      done({ child, port: message.port });
    });
  });
}

function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((done) => {
    child.once('exit', () => { done(); });
    child.send({ type: 'stop' });
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  // El banco usa la compilación normal de `pnpm build`, nunca la de la demo o las E2E.
  delete process.env['ERRORLOG_DEMO'];
  delete process.env['ERRORLOG_E2E'];
  if (!existsSync(resolve(ROOT, '.next', 'BUILD_ID'))) throw new Error('Falta la compilación: ejecuta antes `pnpm build`.');

  const directory = mkdtempSync(join(tmpdir(), 'errorlog-bench-'));
  const file = join(directory, 'bench.db');
  const db = createDb(file);
  let server: ChildProcess | undefined;
  try {
    migrate(db, { migrationsFolder: resolve(ROOT, 'drizzle') });
    seed(db, new Date());
    const errorIds = loadDataset(db).errors.map((error) => error.id);
    const started = await startServer(file);
    server = started.child;
    const baseUrl = `http://127.0.0.1:${String(started.port)}`;

    console.log(`# Notebook · banco de medidas · Node ${process.version} · ${new Date().toISOString()}`);
    const results: Record<string, SizeReport> = {};
    for (const size of options.sizes) {
      const report = await measureSize(db, server, baseUrl, size, options.runs, errorIds);
      results[String(size)] = report;
      print(size, report);
    }
    if (options.json !== null) writeFileSync(options.json, `${JSON.stringify(results, null, 2)}\n`);
  } finally {
    if (server !== undefined) await stopServer(server);
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv.includes('--serve')) {
  serve().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
} else {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
