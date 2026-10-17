import type { WritingLibraryRow, WritingRow } from '@/lib/db/writingRepo';
import type { Messages } from '@/lib/i18n';
import { writingTotal, type LibraryEntry } from '@/lib/writing/library';
import { sessionTitle, shortDate } from '../_shared/format';
import type { PieceOption, WritingEditablePiece } from './PieceForm';

/** El título guardado o, en los textos antiguos, el nombre de su sesión. Nunca uno inventado. */
export function writingTitle(row: Pick<WritingLibraryRow, 'piece' | 'session'>, t: Messages): string {
  return row.piece.title ?? sessionTitle(row.session, t);
}

export type LibraryItem = LibraryEntry & { readonly row: WritingLibraryRow };

export function libraryItems(rows: readonly WritingLibraryRow[], t: Messages): LibraryItem[] {
  return rows.map((row) => ({
    id: row.piece.id,
    title: writingTitle(row, t),
    text: row.piece.originalText,
    genre: row.piece.genre,
    status: row.piece.status,
    date: row.piece.date,
    total: writingTotal(row.piece),
    row,
  }));
}

/** Los textos que se pueden elegir como original de una reescritura, de más reciente a más antiguo. */
export function pieceOptions(items: readonly LibraryItem[], t: Messages): PieceOption[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .map((item) => ({ id: item.id, label: `${shortDate(item.date, t)} · ${item.title} · ${t.labels.genre[item.genre]}` }));
}

/** Lo que edita el drawer: sin el texto, que no hace falta mandar al navegador dos veces. */
export function editableRow(piece: WritingRow): WritingEditablePiece {
  const { id, sessionId, date, genre, status, correctedOn, teacherComment, personalNotes, wordCount, minutes, timed, rewriteOf, corrector } = piece;
  const { bandContent, bandCommunicative, bandOrganisation, bandLanguage } = piece;
  return { id, sessionId, date, genre, status, correctedOn, teacherComment, personalNotes, wordCount, minutes, timed, rewriteOf, corrector, bandContent, bandCommunicative, bandOrganisation, bandLanguage };
}
