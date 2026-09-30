import { sql } from 'drizzle-orm';

import type { Db } from './client';
import { setErrorNoteLink } from './notebookLinkRepo';
import { createNotebookFolder, createNotebookNote } from './notebookRepo';
import { notebookFolder, notebookNote } from './schema';

/**
 * Cuadernos sintéticos para medir Notebook a 50, 500 y 5.000 apuntes (TASK 7.2).
 *
 * Deterministas: el apunte `i` sale igual en cada ejecución, así que dos mediciones se
 * comparan sobre el mismo texto. Y ampliables: `growNotebookFixture` añade los apuntes que
 * faltan hasta el tamaño pedido, de modo que un servidor ya arrancado puede medir 50,
 * crecer a 500 y medir otra vez sin volver a empezar.
 *
 * Todo entra por `createNotebookNote`, el mismo camino que la app: el índice FTS y el texto
 * normalizado son los reales, no una aproximación.
 */

export type NotebookFixtureProfile = 'representative' | 'compact';

export interface NotebookFixtureOptions {
  /** `compact` deja cuerpos cortos: sirve para pruebas que solo necesitan muchas filas. */
  readonly profile?: NotebookFixtureProfile;
  /** Errores existentes a los que vincular uno de cada diez apuntes. */
  readonly errorIds?: readonly number[];
  /** Fecha de referencia: los apuntes se reparten por el año anterior. */
  readonly now?: Date;
}

export interface NotebookFixtureSummary {
  readonly notes: number;
  readonly folders: number;
  readonly links: number;
  /** Bytes UTF-8 de todo el Markdown del cuaderno. */
  readonly markdownBytes: number;
}

/** Palabra que solo aparece en el cuerpo del apunte `index`: sirve de búsqueda rara. */
export function notebookFixtureMarker(index: number): string {
  return `marcador${String(index).padStart(5, '0')}`;
}

const TOPICS = [
  'Modal verbs in the past', 'Inversion after negative adverbials', 'Cleft sentences',
  'Mixed conditionals', 'Wish and if only', 'Participle clauses', 'Reported speech',
  'Phrasal verbs with get', 'Phrasal verbs with put', 'Collocations with make and do',
  'Dependent prepositions', 'Word formation: prefixes', 'Word formation: suffixes',
  'Linking words for essays', 'Formal register in reports', 'Articles with abstract nouns',
  'Gerunds and infinitives', 'Relative clauses', 'Passive with reporting verbs',
  'Future in the past', 'Emphatic do', 'Ellipsis and substitution', 'Idioms about time',
  'Comparative structures', 'Hedging language',
] as const;

const SENTENCES = [
  'He must have left the keys at the office last night.',
  'She can\'t have finished the whole report in ten minutes.',
  'They might have missed the last train home.',
  'Never before had the committee faced such a difficult decision.',
  'Not only did she pass the exam, but she also got the highest mark.',
  'It was the lack of preparation that caused the problem.',
  'What I really need is a quiet place to revise.',
  'If I had studied harder, I would be at university now.',
  'I wish I had taken the advice more seriously.',
  'Having finished the essay, she checked every paragraph again.',
  'The meeting had to be called off at the last minute.',
  'We need to put off the decision until next week.',
  'He got over the disappointment surprisingly quickly.',
  'You should make an effort to do your homework on time.',
  'The results are consistent with the previous findings.',
  'It is widely believed that the policy will be reviewed.',
  'Hardly had we arrived when the storm began.',
  'Little did they know what was waiting for them.',
  'La regla se aplica cuando la deducción se refiere al pasado.',
  'Ojo con el participio: must had es siempre un error.',
  'Se usa en registro formal y casi nunca en conversación.',
  'La inversión exige el auxiliar antes del sujeto.',
  'Conviene anotar la colocación completa, no la palabra suelta.',
  'En el examen suele aparecer en la Parte 4 de Use of English.',
  'Repasar con ejemplos propios ayuda a fijar la estructura.',
  'El error típico es traducir literalmente desde el español.',
  'Could have implica una posibilidad que no se cumplió.',
  'Should have expresa una crítica o un arrepentimiento.',
  'Needn\'t have indica que se hizo algo innecesario.',
  'La forma negativa cambia el significado por completo.',
] as const;

const TAGS = [
  'grammar', 'vocabulary', 'part1', 'part2', 'part3', 'part4', 'writing', 'speaking',
  'modales', 'inversion', 'phrasal', 'collocations', 'register', 'repaso', 'examen',
  'errores-frecuentes', 'formal', 'informal', 'listening', 'reading',
] as const;

const ROOT_NAMES = [
  'Grammar', 'Vocabulary', 'Use of English', 'Reading', 'Writing', 'Listening', 'Speaking',
  'Exam strategy', 'Collocations', 'Phrasal verbs', 'Idioms', 'Word formation',
] as const;

/** mulberry32: pequeño, rápido y suficiente para repartir tamaños y temas. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)] as T;
}

function paragraph(next: () => number, sentences: number): string {
  return Array.from({ length: sentences }, () => pick(next, SENTENCES)).join(' ');
}

/**
 * Tamaños de un cuaderno de estudio real: la mayoría caben en una pantalla, una cuarta
 * parte son apuntes largos y unos pocos son documentos de referencia de decenas de KiB.
 */
function sectionCount(next: () => number, profile: NotebookFixtureProfile): number {
  if (profile === 'compact') return 1;
  const roll = next();
  if (roll < 0.03) return 70 + Math.floor(next() * 60);
  if (roll < 0.28) return 10 + Math.floor(next() * 10);
  return 1 + Math.floor(next() * 3);
}

function noteBody(index: number, title: string, next: () => number, profile: NotebookFixtureProfile): string {
  const parts: string[] = [];
  if (next() < 0.5) parts.push(`# ${title}`);
  parts.push(paragraph(next, 3));
  const sections = sectionCount(next, profile);
  for (let section = 1; section <= sections; section += 1) {
    parts.push(`## ${pick(next, TOPICS)} ${String(section)}`);
    parts.push(paragraph(next, 2 + Math.floor(next() * 4)));
    const extra = next();
    if (extra < 0.2) {
      parts.push([
        '| Forma | Ejemplo | Uso |', '| --- | --- | --- |',
        ...Array.from({ length: 3 }, () => `| ${pick(next, TOPICS)} | ${pick(next, SENTENCES)} | ${pick(next, SENTENCES)} |`),
      ].join('\n'));
    } else if (extra < 0.4) {
      parts.push(Array.from({ length: 4 }, () => `- ${pick(next, SENTENCES)}`).join('\n'));
    } else if (extra < 0.5) {
      parts.push(`> **Regla:** ${pick(next, SENTENCES)}`);
    } else if (extra < 0.55) {
      parts.push(`### Ejemplos\n\n- [ ] ${pick(next, SENTENCES)}\n- [x] ${pick(next, SENTENCES)}`);
    }
  }
  parts.push(`Referencia interna ${notebookFixtureMarker(index)}.`);
  return `${parts.join('\n\n')}\n`;
}

interface FixtureNote {
  readonly title: string;
  readonly tags: string[];
  readonly contentMarkdown: string;
  readonly minutesAgo: number;
  /** `null`: sin carpeta. Si no, qué carpeta de las que haya en ese momento. */
  readonly folderRoll: number | null;
  readonly linkRoll: number;
}

/** Todo sale de la semilla del índice, siempre en el mismo orden de tiradas. */
function fixtureNote(index: number, profile: NotebookFixtureProfile): FixtureNote {
  const next = random(index + 1);
  const title = `${pick(next, TOPICS)} · ${String(index + 1)}`;
  // Una de cada diez queda sin carpeta, como pasa con lo que se apunta deprisa.
  const folderRoll = next() < 0.1 ? null : next();
  const tags = [...new Set(Array.from({ length: Math.floor(next() * 4) }, () => pick(next, TAGS)))];
  const minutesAgo = Math.floor(next() * 365 * 24 * 60);
  const contentMarkdown = noteBody(index, title, next, profile);
  return { title, tags, contentMarkdown, minutesAgo, folderRoll, linkRoll: next() };
}

/** El Markdown del apunte `index`, el mismo que `growNotebookFixture` guardaría. */
export function notebookFixtureMarkdown(index: number, profile: NotebookFixtureProfile = 'representative'): string {
  return fixtureNote(index, profile).contentMarkdown;
}

/** Carpetas para `notes` apuntes: una raíz por cada 250 y dos subcarpetas por raíz. */
function folderPlan(notes: number): Array<{ readonly name: string; readonly parent: string | null }> {
  const roots = Math.min(Math.max(Math.ceil(notes / 250), 3), ROOT_NAMES.length * 2);
  const plan: Array<{ readonly name: string; readonly parent: string | null }> = [];
  for (let root = 0; root < roots; root += 1) {
    const base = ROOT_NAMES[root % ROOT_NAMES.length] as string;
    const name = root < ROOT_NAMES.length ? base : `${base} II`;
    plan.push({ name, parent: null });
    plan.push({ name: 'Apuntes de clase', parent: name }, { name: 'Repaso', parent: name });
  }
  return plan;
}

/**
 * Amplía el cuaderno hasta `target` apuntes. Crea antes las carpetas que correspondan a ese
 * tamaño y después los apuntes que falten, dentro de una sola transacción.
 */
export function growNotebookFixture(db: Db, target: number, options: NotebookFixtureOptions = {}): NotebookFixtureSummary {
  const profile = options.profile ?? 'representative';
  const now = options.now ?? new Date('2026-09-29T08:00:00.000Z');
  const errorIds = options.errorIds ?? [];
  const sqlite = db.$client;
  sqlite.transaction(() => {
    const existing = new Map(db.select().from(notebookFolder).all()
      .map((folder) => [`${String(folder.parentId)}/${folder.name}`, folder.id]));
    const rootIds = new Map<string, number>();
    for (const folder of db.select().from(notebookFolder).all()) {
      if (folder.parentId === null) rootIds.set(folder.name, folder.id);
    }
    const at = now.toISOString();
    for (const { name, parent } of folderPlan(target)) {
      const parentId = parent === null ? null : rootIds.get(parent) ?? null;
      if (existing.has(`${String(parentId)}/${name}`)) continue;
      const created = createNotebookFolder(db, { name, parentId }, at);
      existing.set(`${String(parentId)}/${name}`, created.id);
      if (parentId === null) rootIds.set(name, created.id);
    }

    const folderIds = [...existing.values()].sort((a, b) => a - b);
    const current = db.select({ count: sql<number>`count(*)` }).from(notebookNote).get()?.count ?? 0;
    for (let index = current; index < target; index += 1) {
      const draft = fixtureNote(index, profile);
      const folderId = draft.folderRoll === null ? null : folderIds[Math.floor(draft.folderRoll * folderIds.length)] ?? null;
      const noteAt = new Date(now.getTime() - draft.minutesAgo * 60_000).toISOString();
      const { note } = createNotebookNote(db, {
        uid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        title: draft.title, folderId, tags: draft.tags, contentMarkdown: draft.contentMarkdown,
      }, noteAt);
      if (errorIds.length > 0 && index % 10 === 0) {
        const errorId = errorIds[Math.floor(draft.linkRoll * errorIds.length)] as number;
        setErrorNoteLink(db, { errorId, noteId: note.id, headingSlug: null }, noteAt);
      }
    }
  })();
  return summarizeNotebookFixture(db);
}

export function summarizeNotebookFixture(db: Db): NotebookFixtureSummary {
  const row = db.$client.prepare<[], { notes: number; bytes: number | null }>(
    'SELECT count(*) AS notes, sum(length(CAST(content_markdown AS BLOB))) AS bytes FROM notebook_note',
  ).get();
  const folders = db.$client.prepare<[], { total: number }>('SELECT count(*) AS total FROM notebook_folder').get();
  const links = db.$client.prepare<[], { total: number }>('SELECT count(*) AS total FROM notebook_error_link').get();
  return {
    notes: row?.notes ?? 0,
    folders: folders?.total ?? 0,
    links: links?.total ?? 0,
    markdownBytes: row?.bytes ?? 0,
  };
}
