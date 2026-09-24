'use server';

import { getDb } from '@/lib/db/client';
import { searchErrors, searchSessions } from '@/lib/db/repo';
import { SOURCES } from '@/lib/domain/enums';
import { practiceLabel, sessionTitle, shortDate } from './format';
import { CATEGORY_LABELS, SOURCE_LABELS } from './labels';

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

export interface PaletteResults {
  readonly errors: readonly PaletteError[];
  readonly sessions: readonly PaletteSession[];
}

const MAX_QUERY = 200;

export async function searchPaletteAction(query: string): Promise<PaletteResults> {
  const q = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY) : '';
  if (q === '') return { errors: [], sessions: [] };
  const db = getDb();
  const lower = q.toLowerCase();
  const sources = SOURCES.filter((source) => SOURCE_LABELS[source].toLowerCase().includes(lower));

  const errors = searchErrors(db, { q, limit: 5, offset: 0 }).rows.map(({ error, session }) => ({
    id: error.id,
    sessionId: session.id,
    mine: error.myAnswer,
    correct: error.correctAnswer,
    sub: `${CATEGORY_LABELS[error.category]} · ${sessionTitle(session)} · ${shortDate(session.date)}`,
  }));
  const sessions = searchSessions(db, { q, sources, limit: 3, offset: 0 }).rows.map((session) => ({
    id: session.id,
    title: sessionTitle(session),
    sub: `${shortDate(session.date)} · ${practiceLabel(session)}`,
  }));
  return { errors, sessions };
}
