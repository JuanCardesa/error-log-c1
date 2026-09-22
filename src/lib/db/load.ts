import type { AnkiDataset, Dataset, ErrorRow, SessionRow, WritingPieceRow } from '../domain/types';
import { withSessionFormat } from '../domain/session';
import type { Db } from './client';
import { ankiNote, ankiCard, ankiReview, ankiSync, errorRow, session, writingPiece } from './schema';

/**
 * Puente entre la base y las queries puras: lee filas y las entrega como `Dataset`.
 *
 * La agregacion se hace en TypeScript, no en SQL, para que toda la logica de negocio sea
 * testeable con fixtures y sin base de datos (ver docs/PLAN.md §2). El volumen de una
 * herramienta personal —centenares de filas al año— hace que la diferencia no se note.
 */
export function loadDataset(db: Db): Dataset {
  const sessions = db.select().from(session).all().map(withSessionFormat) satisfies SessionRow[];
  const errors = db.select().from(errorRow).all() satisfies ErrorRow[];
  const pieces = db.select().from(writingPiece).all() satisfies WritingPieceRow[];

  return { sessions, errors, pieces };
}

export function loadAnkiDataset(db: Db): AnkiDataset {
  return {
    notes: db.select().from(ankiNote).all(),
    cards: db.select().from(ankiCard).all(),
    reviews: db.select().from(ankiReview).all(),
    sync: db.select().from(ankiSync).get() ?? null,
  };
}
