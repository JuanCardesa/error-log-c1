'use server';

import { getDb } from '@/lib/db/client';
import { searchNotebookNotes } from '@/lib/db/notebookSearch';
import { searchErrors, searchSessions } from '@/lib/db/repo';
import { SOURCES } from '@/lib/domain/enums';
import { practiceLabel, sessionTitle, shortDate } from './format';
import { getT } from './i18nServer';

/**
 * Resultados de la paleta Ctrl/⌘+K. Se consultan en el servidor, paginados: nunca se
 * baja el historial entero al navegador para buscar en él.
 */

export interface PaletteError {
  readonly id: number;
  readonly sessionId: number;
  readonly mine: string | null;
  readonly correct: string;
  readonly sub: string;
}

export interface PaletteSession {
  readonly id: number;
  readonly title: string;
  readonly sub: string;
}

export interface PaletteNote {
  readonly id: number;
  readonly title: string;
  readonly sub: string;
}

export interface PaletteResults {
  readonly errors: readonly PaletteError[];
  readonly sessions: readonly PaletteSession[];
  readonly notes: readonly PaletteNote[];
}

const MAX_QUERY = 200;

export async function searchPaletteAction(query: string): Promise<PaletteResults> {
  const q = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY) : '';
  if (q === '') return { errors: [], sessions: [], notes: [] };
  const db = getDb();
  const t = await getT();
  const lower = q.toLowerCase();
  // La fuente se busca por su nombre en el idioma en que se lee.
  const sources = SOURCES.filter((source) => t.labels.source[source].toLowerCase().includes(lower));

  const errors = searchErrors(db, { q, limit: 5, offset: 0, includeTotal: false }).rows.map(({ error, session }) => ({
    id: error.id,
    sessionId: session.id,
    mine: error.myAnswer,
    correct: error.correctAnswer,
    sub: `${t.labels.category[error.category]} · ${sessionTitle(session, t)} · ${shortDate(session.date, t)}`,
  }));
  const sessions = searchSessions(db, { q, sources, limit: 3, offset: 0, includeTotal: false }).rows.map((session) => ({
    id: session.id,
    title: sessionTitle(session, t),
    sub: `${shortDate(session.date, t)} · ${practiceLabel(session, t)}`,
  }));
  const notes = searchNotebookNotes(db, { query: q, folderId: null, tag: null, page: 1 }).items
    .slice(0, 3).map((note) => ({
      id: note.id,
      title: note.title,
      sub: note.tags.length > 0 ? note.tags.join(' · ') : t.palette.note,
    }));
  return { errors, sessions, notes };
}
