import { eq } from 'drizzle-orm';

import { resolveStudyAnchor, type StudyAnchor } from '../notebook/annotations';
import { textFingerprint } from '../writing/fingerprint';
import { countWords, normalizeWritingText, paragraphsOf } from '../writing/text';
import type { Db } from './client';
import { writingAnnotation, writingPiece, writingTextHistory } from './schema';

export type WritingTextUpdateResult =
  | { readonly ok: true; readonly revision: number; readonly wordCount: number; readonly placed: number; readonly unplaced: number }
  | { readonly ok: false; readonly reason: 'missing' | 'conflict' };

function validAnchor(text: string, anchor: StudyAnchor): boolean {
  return anchor.start >= 0 && anchor.end > anchor.start && anchor.end <= text.length
    && text.slice(anchor.start, anchor.end) === anchor.exact;
}

/**
 * El párrafo se sigue por su contenido: si aparece una sola vez, va allí aunque se hayan
 * reordenado. Si no aparece (se editó), conserva el sitio mientras el número de párrafos no
 * cambie. Cualquier otra duda devuelve `undefined`: la anotación queda por colocar.
 */
function relocateParagraph(
  exact: string, current: number, oldCount: number, nextText: string, nextParagraphs: ReturnType<typeof paragraphsOf>,
): number | undefined {
  const matches = nextParagraphs.filter((paragraph) => nextText.slice(paragraph.start, paragraph.end) === exact);
  if (matches.length === 1) return matches[0]?.number;
  if (matches.some((paragraph) => paragraph.number === current)) return current;
  if (matches.length === 0 && oldCount === nextParagraphs.length) return current;
  return undefined;
}

/**
 * Reemplaza la transcripción y conserva historial y anotaciones en la misma transacción.
 * Con `expectedRevision`, un guardado hecho sobre una revisión ya superada (otra pestaña)
 * se rechaza como conflicto en vez de pisarla.
 */
export function updateWritingText(
  db: Db, pieceId: number, source: string, now: Date, expectedRevision?: number,
): WritingTextUpdateResult {
  const nextText = normalizeWritingText(source);
  return db.transaction((tx): WritingTextUpdateResult => {
    const piece = tx.select({
      id: writingPiece.id, text: writingPiece.originalText, revision: writingPiece.textRevision,
    }).from(writingPiece).where(eq(writingPiece.id, pieceId)).get();
    if (piece === undefined) return { ok: false, reason: 'missing' };
    if (expectedRevision !== undefined && piece.revision !== expectedRevision) return { ok: false, reason: 'conflict' };
    if (piece.text === nextText) {
      return { ok: true, revision: piece.revision, wordCount: countWords(nextText), placed: 0, unplaced: 0 };
    }

    const at = now.toISOString();
    let placed = 0;
    let unplaced = 0;
    if (piece.text !== null) {
      tx.insert(writingTextHistory).values({
        pieceId, text: piece.text, textRevision: piece.revision, replacedAt: at,
      }).run();

      const oldParagraphs = paragraphsOf(piece.text);
      const nextParagraphs = paragraphsOf(nextText);
      const annotations = tx.select().from(writingAnnotation).where(eq(writingAnnotation.pieceId, pieceId)).all();
      for (const annotation of annotations) {
        if (annotation.scope === 'SPAN' && annotation.anchor !== null) {
          const anchor = validAnchor(piece.text, annotation.anchor)
            ? resolveStudyAnchor(nextText, annotation.anchor, piece.text) : null;
          tx.update(writingAnnotation).set({
            anchor,
            quote: anchor === null ? annotation.anchor.exact : annotation.quote ?? anchor.exact,
            updatedAt: at,
          }).where(eq(writingAnnotation.id, annotation.id)).run();
          if (anchor === null) unplaced += 1;
          else placed += 1;
        } else if (annotation.scope === 'PARAGRAPH' && annotation.paragraph !== null) {
          const previous = oldParagraphs.find((paragraph) => paragraph.number === annotation.paragraph);
          if (previous === undefined) continue;
          const exact = piece.text.slice(previous.start, previous.end);
          const target = relocateParagraph(exact, annotation.paragraph, oldParagraphs.length, nextText, nextParagraphs);
          if (target === annotation.paragraph) continue;
          if (target !== undefined) {
            tx.update(writingAnnotation).set({ paragraph: target, updatedAt: at })
              .where(eq(writingAnnotation.id, annotation.id)).run();
            continue;
          }
          tx.update(writingAnnotation).set({
            scope: 'SPAN', anchor: null, paragraph: null, quote: exact, updatedAt: at,
          }).where(eq(writingAnnotation.id, annotation.id)).run();
          unplaced += 1;
        }
      }
    }

    const revision = piece.revision + 1;
    const wordCount = countWords(nextText);
    tx.update(writingPiece).set({
      originalText: nextText, textFingerprint: textFingerprint(nextText), textRevision: revision,
      wordCount, updatedAt: at,
    }).where(eq(writingPiece.id, pieceId)).run();
    return { ok: true, revision, wordCount, placed, unplaced };
  }, { behavior: 'immediate' });
}
