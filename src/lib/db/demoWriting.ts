import { randomUUID } from 'node:crypto';

import { asc, eq, isNull } from 'drizzle-orm';

import { studyAnchor } from '../notebook/annotations';
import { textFingerprint } from '../writing/fingerprint';
import { countWords } from '../writing/text';
import type { Db } from './client';
import { writingAnnotation, writingPiece } from './schema';

/** Da a la demo un Writing transcrito, con una corrección y una fortaleza para recorrer el lector. */
export function seedDemoWriting(db: Db, now: Date): void {
  const piece = db.select().from(writingPiece).where(isNull(writingPiece.rewriteOf))
    .orderBy(asc(writingPiece.date), asc(writingPiece.id)).get();
  if (piece === undefined || piece.originalText !== null) return;

  const text = [
    'Many cities are trying to make public transport more attractive. A reliable network can reduce traffic and make daily journeys easier.',
    'Green spaces help too, but there effect is less direct. They need regular care and some residents do not use them often.',
    'Overall, I believe transport should come first because it benefits more people every day.',
  ].join('\n\n');
  const at = now.toISOString();
  const quote = 'there';
  const start = text.indexOf(quote);
  db.update(writingPiece).set({
    title: 'Making cities more liveable',
    taskPrompt: 'Which measure should local authorities prioritise: public transport or green spaces?',
    originalText: text,
    textFingerprint: textFingerprint(text),
    textRevision: 1,
    dateBasis: 'WRITTEN',
    correctedOn: piece.date,
    status: 'CORRECTED',
    corrector: 'PROFESOR',
    bandContent: 3.5,
    bandCommunicative: 3,
    bandOrganisation: 3.5,
    bandLanguage: 2.5,
    teacherComment: 'The position is clear. Make the comparison more precise in paragraph two.',
    personalNotes: 'Check possessives and contrast linkers.',
    wordMin: 220,
    wordMax: 260,
    wordCount: countWords(text),
    updatedAt: at,
  }).where(eq(writingPiece.id, piece.id)).run();

  db.insert(writingAnnotation).values([
    {
      id: randomUUID(), pieceId: piece.id, kind: 'ERROR', focus: 'GRAMMAR', source: 'PROFESOR', scope: 'SPAN',
      anchor: studyAnchor(text, start, start + quote.length), paragraph: 2, quote,
      comment: 'This is a possessive determiner.', suggestion: 'their', reviewedAt: null, importKey: null,
      createdAt: at, updatedAt: at,
    },
    {
      id: randomUUID(), pieceId: piece.id, kind: 'STRENGTH', focus: 'CONTENT', source: 'PROFESOR', scope: 'DOCUMENT',
      anchor: null, paragraph: null, quote: null,
      comment: 'The comparison answers the task directly.', suggestion: null, reviewedAt: null, importKey: null,
      createdAt: at, updatedAt: at,
    },
  ]).run();
}
