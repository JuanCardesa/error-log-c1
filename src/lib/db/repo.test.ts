import { migrate } from './migrate';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  ErrorInput,
  SessionInput,
  WritingPieceInput,
} from '../validation/schemas';
import { sessionInputSchema } from '../validation/schemas';
import { type Db, createDb } from './client';
import { MIGRATIONS_DIR } from './paths';
import {
  countOpenSessions,
  createError,
  createSession,
  deleteError,
  deleteSession,
  distinctSubcategories,
  getSession,
  hasWritingPiece,
  lastUsedCategory,
  listErrors,
  listOpenSessions,
  listSessions,
  searchErrors,
  searchSessions,
  sessionDeletionImpact,
  createWritingPiece,
  deleteWritingPiece,
  getWritingPiece,
  listWritingPieces,
  setSessionStatus,
  updateWritingPiece,
  writingSessionsWithoutPiece,
  unmarkAnkiAdded,
  updateError,
  updateSession,
} from './repo';
import { writingPiece } from './schema';
import { linkAnkiNote } from './ankiRepo';

let db: Db;

function sessionInput(overrides: Partial<SessionInput> = {}): SessionInput {
  return sessionInputSchema({ today: '2026-09-14' }).parse({
    date: '2026-09-10',
    kind: 'DRILL',
    paper: 'RUOE',
    part: 4,
    source: 'LIBRO',
    sourceRef: null,
    itemsTotal: 8,
    itemsCorrect: 5,
    durationMin: 20,
    timed: false,
    status: 'OPEN',
    ...overrides,
  });
}

function errorInput(sessionId: number, overrides: Partial<ErrorInput> = {}): ErrorInput {
  return {
    sessionId,
    itemRef: '3',
    prompt: 'The company has ______ a significant loss',
    myAnswer: 'suffered',
    correctAnswer: 'sustained',
    cause: 'CONFUSION',
    category: 'COLOCACION',
    subcategory: null,
    confidence: 'DUDABA',
    lateInSession: false,
    ruleNote: 'sustain a loss es la colocacion formal, suffer es mas general',
    ...overrides,
  };
}

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
});

describe('sesiones', () => {
  it('crea y recupera', () => {
    const created = createSession(db, sessionInput());
    expect(created.id).toBeGreaterThan(0);
    expect(getSession(db, created.id)?.paper).toBe('RUOE');
  });

  it('devuelve null si no existe', () => {
    expect(getSession(db, 999)).toBeNull();
  });

  it('lista de mas reciente a mas antigua', () => {
    createSession(db, sessionInput({ date: '2026-09-01' }));
    createSession(db, sessionInput({ date: '2026-09-12' }));
    createSession(db, sessionInput({ date: '2026-09-05' }));

    expect(listSessions(db).map((s) => s.date)).toEqual([
      '2026-09-12',
      '2026-09-05',
      '2026-09-01',
    ]);
  });

  it('respeta el limite', () => {
    for (let i = 0; i < 5; i += 1) createSession(db, sessionInput());
    expect(listSessions(db, 2)).toHaveLength(2);
  });

  it('filtra las abiertas', () => {
    const open = createSession(db, sessionInput({ status: 'OPEN' }));
    createSession(db, sessionInput({ status: 'CLOSED' }));

    expect(listOpenSessions(db).map((s) => s.id)).toEqual([open.id]);
  });

  it('cierra y reabre', () => {
    const created = createSession(db, sessionInput({ status: 'OPEN' }));

    setSessionStatus(db, created.id, 'CLOSED');
    expect(getSession(db, created.id)?.status).toBe('CLOSED');

    setSessionStatus(db, created.id, 'OPEN');
    expect(getSession(db, created.id)?.status).toBe('OPEN');
  });

  it('corrige una sesion pasada', () => {
    const created = createSession(db, sessionInput({ itemsCorrect: 5 }));
    updateSession(db, created.id, sessionInput({ itemsCorrect: 7, sourceRef: 'Unidad 2' }));

    const after = getSession(db, created.id);
    expect(after?.itemsCorrect).toBe(7);
    expect(after?.sourceRef).toBe('Unidad 2');
  });

  it('al borrarla arrastra sus errores', () => {
    const created = createSession(db, sessionInput());
    createError(db, errorInput(created.id));
    expect(listErrors(db, created.id)).toHaveLength(1);

    deleteSession(db, created.id);
    expect(getSession(db, created.id)).toBeNull();
    expect(listErrors(db, created.id)).toEqual([]);
  });
});

describe('errores', () => {
  it('crea y lista', () => {
    const session = createSession(db, sessionInput());
    createError(db, errorInput(session.id));
    createError(db, errorInput(session.id, { itemRef: '7' }));

    expect(listErrors(db, session.id)).toHaveLength(2);
  });

  it('no lista nada en una sesion sin errores', () => {
    const session = createSession(db, sessionInput());
    expect(listErrors(db, session.id)).toEqual([]);
  });

  it('lista el mas reciente primero, que es el que se acaba de teclear', () => {
    const session = createSession(db, sessionInput());
    const first = createError(db, errorInput(session.id, { itemRef: '1' }));
    const second = createError(db, errorInput(session.id, { itemRef: '2' }));

    expect(listErrors(db, session.id).map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it('edita y borra', () => {
    const session = createSession(db, sessionInput());
    const created = createError(db, errorInput(session.id));

    updateError(db, created.id, errorInput(session.id, { correctAnswer: 'incurred' }));
    expect(listErrors(db, session.id)[0]?.correctAnswer).toBe('incurred');

    expect(deleteError(db, created.id)).toBe(true);
    expect(deleteError(db, created.id)).toBe(false);
    expect(listErrors(db, session.id)).toEqual([]);
  });
});

describe('conversion a tarjeta', () => {
  it('sella fecha y vinculo al crear la nota, y los limpia al deshacer', () => {
    const session = createSession(db, sessionInput());
    const created = createError(db, errorInput(session.id));

    linkAnkiNote(db, created.id, {
      noteId: 20, model: 'Error Log C1', label: 'deal with', tags: [], category: null,
      firstSeenAt: '2026-09-12T18:00:00.000Z', lastSeenAt: '2026-09-12T18:00:00.000Z',
    }, '2026-09-12T18:00:00.000Z', 'huella');
    const marked = listErrors(db, session.id)[0];
    expect(marked?.ankiAdded).toBe(true);
    expect(marked?.ankiAddedAt).toBe('2026-09-12T18:00:00.000Z');
    expect(marked?.ankiNoteId).toBe(20);

    unmarkAnkiAdded(db, created.id);
    const cleared = listErrors(db, session.id)[0];
    expect(cleared?.ankiAdded).toBe(false);
    // El CHECK de la base exige que no quede fecha huerfana.
    expect(cleared?.ankiAddedAt).toBeNull();
    expect(cleared?.ankiNoteId).toBeNull();
  });
});

describe('sugerencias para el autocompletado', () => {
  it('ordena las subcategorias de mas usada a menos', () => {
    const session = createSession(db, sessionInput());
    for (let i = 0; i < 3; i += 1) {
      createError(db, errorInput(session.id, { subcategory: 'prefijos negativos' }));
    }
    createError(db, errorInput(session.id, { subcategory: 'cleft' }));

    expect(distinctSubcategories(db)).toEqual(['prefijos negativos', 'cleft']);
  });

  it('ignora las vacias y las que son solo espacios', () => {
    const session = createSession(db, sessionInput());
    createError(db, errorInput(session.id, { subcategory: null }));
    createError(db, errorInput(session.id, { subcategory: '   ' }));
    createError(db, errorInput(session.id, { subcategory: 'cleft' }));

    expect(distinctSubcategories(db)).toEqual(['cleft']);
  });

  it('devuelve lista vacia sin datos', () => {
    expect(distinctSubcategories(db)).toEqual([]);
    expect(lastUsedCategory(db)).toBeNull();
  });

  it('recuerda la ultima categoria usada', () => {
    const session = createSession(db, sessionInput());
    createError(db, errorInput(session.id, { category: 'COLOCACION' }));
    createError(db, errorInput(session.id, { category: 'PHRASAL_VERB' }));

    expect(lastUsedCategory(db)).toBe('PHRASAL_VERB');
  });
});

describe('textos de writing', () => {
  function writingSession(date = '2026-09-10') {
    return createSession(
      db,
      sessionInput({
        date,
        kind: 'WRITING',
        paper: 'WRITING',
        part: 1,
        itemsTotal: null,
        itemsCorrect: null,
      }),
    );
  }

  function pieceInput(
    sessionId: number,
    overrides: Partial<WritingPieceInput> = {},
  ): WritingPieceInput {
    return {
      sessionId,
      date: '2026-09-10',
      genre: 'ESSAY',
      wordCount: 240,
      minutes: 45,
      timed: true,
      rewriteOf: null,
      corrector: 'PROFESOR',
      bandContent: 3,
      bandCommunicative: 3,
      bandOrganisation: 2,
      bandLanguage: 2,
      ...overrides,
    };
  }

  it('detecta si la sesion ya tiene uno', () => {
    const session = writingSession();
    expect(hasWritingPiece(db, session.id)).toBe(false);

    db.insert(writingPiece)
      .values({ sessionId: session.id, date: '2026-09-10', genre: 'ESSAY' })
      .run();

    expect(hasWritingPiece(db, session.id)).toBe(true);
  });

  it('crea y recupera con las cuatro bandas', () => {
    const session = writingSession();
    const created = createWritingPiece(db, pieceInput(session.id));

    const found = getWritingPiece(db, created.id);
    expect(found?.bandContent).toBe(3);
    expect(found?.bandOrganisation).toBe(2);
    expect(found?.genre).toBe('ESSAY');
  });

  it('devuelve null si no existe', () => {
    expect(getWritingPiece(db, 999)).toBeNull();
  });

  it('lista de mas reciente a mas antiguo', () => {
    const a = writingSession('2026-09-01');
    const b = writingSession('2026-09-12');
    createWritingPiece(db, pieceInput(a.id, { date: '2026-09-01' }));
    createWritingPiece(db, pieceInput(b.id, { date: '2026-09-12' }));

    expect(listWritingPieces(db).map((p) => p.date)).toEqual(['2026-09-12', '2026-09-01']);
  });

  it('actualiza las bandas de un texto ya corregido', () => {
    const session = writingSession();
    const created = createWritingPiece(db, pieceInput(session.id));

    updateWritingPiece(db, created.id, pieceInput(session.id, { bandLanguage: 4 }));
    expect(getWritingPiece(db, created.id)?.bandLanguage).toBe(4);
  });

  it('borra', () => {
    const session = writingSession();
    const created = createWritingPiece(db, pieceInput(session.id));

    deleteWritingPiece(db, created.id);
    expect(getWritingPiece(db, created.id)).toBeNull();
  });

  it('enlaza una reescritura con su original', () => {
    const first = writingSession('2026-09-01');
    const second = writingSession('2026-09-12');
    const original = createWritingPiece(db, pieceInput(first.id, { date: '2026-09-01' }));
    const rewrite = createWritingPiece(
      db,
      pieceInput(second.id, { date: '2026-09-12', rewriteOf: original.id }),
    );

    expect(getWritingPiece(db, rewrite.id)?.rewriteOf).toBe(original.id);
  });

  it('solo ofrece sesiones de Writing que sigan libres', () => {
    const free = writingSession('2026-09-12');
    const taken = writingSession('2026-09-01');
    // Una sesion de RUOE no puede albergar un texto: no debe aparecer.
    createSession(db, sessionInput({ paper: 'RUOE' }));
    createWritingPiece(db, pieceInput(taken.id, { date: '2026-09-01' }));

    expect(writingSessionsWithoutPiece(db).map((s) => s.id)).toEqual([free.id]);
  });
});

describe('busqueda del historial', () => {
  it('usa el índice de trigramas sin cambiar las coincidencias ni dejar referencias obsoletas', () => {
    const found = createSession(db, sessionInput({ sourceRef: 'Capítulo "especial" a_b' }));
    expect(searchSessions(db, { q: '"especial"', limit: 10, offset: 0 }).rows.map((row) => row.id)).toEqual([found.id]);
    expect(searchSessions(db, { q: 'a_b', limit: 10, offset: 0 }).total).toBe(1);
    expect(searchSessions(db, { q: 'ap', limit: 10, offset: 0 }).total).toBe(1);
    db.$client.prepare('UPDATE session SET source_ref = ? WHERE id = ?').run('Otro capítulo', found.id);
    expect(searchSessions(db, { q: 'especial', limit: 10, offset: 0 }).total).toBe(0);
    expect(searchSessions(db, { q: 'capítulo', limit: 10, offset: 0 }).total).toBe(1);
    db.$client.prepare('DELETE FROM session WHERE id = ?').run(found.id);
    expect(db.$client.prepare('SELECT rowid FROM session_search_fts WHERE rowid = ?').all(found.id)).toEqual([]);
  });

  it('filtra por referencia, fuente, estado y formato, con el numero de errores', () => {
    const unit = createSession(db, sessionInput({ date: '2026-09-12', sourceRef: 'Unidad 4 · ej. 2' }));
    createSession(db, sessionInput({ date: '2026-09-11', source: 'TRAINER', sourceRef: 'Test 3', status: 'CLOSED' }));
    createSession(db, sessionInput({ date: '2026-09-10', paper: null, part: null, sourceRef: null }));
    createError(db, errorInput(unit.id));
    createError(db, errorInput(unit.id, { itemRef: '4' }));

    const byRef = searchSessions(db, { q: 'UNIDAD 4', limit: 10, offset: 0 });
    expect(byRef.total).toBe(1);
    expect(byRef.rows[0]?.errorCount).toBe(2);

    expect(searchSessions(db, { q: 'trainer', sources: ['TRAINER'], limit: 10, offset: 0 }).rows.map((s) => s.sourceRef)).toEqual(['Test 3']);
    expect(searchSessions(db, { q: '2026-09-10', limit: 10, offset: 0 }).total).toBe(1);
    expect(searchSessions(db, { status: 'OPEN', limit: 10, offset: 0 }).total).toBe(2);
    expect(searchSessions(db, { paper: 'NONE', limit: 10, offset: 0 }).rows[0]?.paper).toBeNull();
    expect(countOpenSessions(db)).toBe(2);
  });

  it('pagina y ordena por fecha en los dos sentidos', () => {
    for (const day of ['01', '02', '03']) createSession(db, sessionInput({ date: `2026-09-${day}` }));
    const first = searchSessions(db, { limit: 2, offset: 0 });
    expect(first.total).toBe(3);
    expect(first.rows.map((s) => s.date)).toEqual(['2026-09-03', '2026-09-02']);
    expect(searchSessions(db, { order: 'asc', limit: 1, offset: 0 }).rows[0]?.date).toBe('2026-09-01');
  });
});

describe('busqueda de errores', () => {
  it('mantiene el índice de texto al corregir, borrar y borrar la sesión', () => {
    const practice = createSession(db, sessionInput());
    const first = createError(db, errorInput(practice.id, { prompt: 'She said "hello" here' }));
    expect(searchErrors(db, { q: '"hello"', limit: 10, offset: 0 }).rows.map((row) => row.error.id)).toEqual([first.id]);
    expect(searchErrors(db, { q: 'he', limit: 10, offset: 0 }).total).toBe(1);
    db.$client.prepare('UPDATE error_row SET prompt = ? WHERE id = ?').run('A different prompt', first.id);
    expect(searchErrors(db, { q: 'hello', limit: 10, offset: 0 }).total).toBe(0);
    expect(searchErrors(db, { q: 'different', limit: 10, offset: 0 }).total).toBe(1);
    deleteError(db, first.id);
    expect(db.$client.prepare('SELECT rowid FROM error_search_fts WHERE rowid = ?').all(first.id)).toEqual([]);
    const second = createError(db, errorInput(practice.id));
    db.$client.prepare('DELETE FROM session WHERE id = ?').run(practice.id);
    expect(db.$client.prepare('SELECT rowid FROM error_search_fts WHERE rowid = ?').all(second.id)).toEqual([]);
  });

  it('busca en enunciado, respuestas y regla, y filtra por clasificacion y fecha de practica', () => {
    const early = createSession(db, sessionInput({ date: '2026-09-01' }));
    const late = createSession(db, sessionInput({ date: '2026-09-12' }));
    createError(db, errorInput(early.id, { prompt: 'She showed complete ___', correctAnswer: 'disregard', category: 'WORD_FORMATION', cause: 'DESCONOCIMIENTO' }));
    createError(db, errorInput(late.id, { correctAnswer: 'off', myAnswer: 'of', cause: 'DESPISTE', confidence: 'SEGURO', ruleNote: 'call off lleva doble f siempre' }));

    expect(searchErrors(db, { q: 'DISREGARD', limit: 10, offset: 0 }).rows.map((r) => r.error.correctAnswer)).toEqual(['disregard']);
    expect(searchErrors(db, { q: 'doble f', limit: 10, offset: 0 }).total).toBe(1);
    expect(searchErrors(db, { category: 'WORD_FORMATION', limit: 10, offset: 0 }).total).toBe(1);
    expect(searchErrors(db, { confidence: 'SEGURO', limit: 10, offset: 0 }).rows[0]?.session.id).toBe(late.id);
    expect(searchErrors(db, { from: '2026-09-05', limit: 10, offset: 0 }).total).toBe(1);
    expect(searchErrors(db, { anki: 'no-aplica', limit: 10, offset: 0 }).rows[0]?.error.cause).toBe('DESPISTE');
    expect(searchErrors(db, { anki: 'pendiente', limit: 10, offset: 0 }).rows[0]?.error.cause).toBe('DESCONOCIMIENTO');
    // Lo mas reciente primero, por fecha de la practica.
    expect(searchErrors(db, { limit: 10, offset: 0 }).rows.map((r) => r.session.date)).toEqual(['2026-09-12', '2026-09-01']);
  });

  it('desde Q2 solo cuenta sesiones con items contabilizados', () => {
    const writing = createSession(db, sessionInput({ kind: 'WRITING', paper: 'WRITING', part: 1, itemsTotal: null, itemsCorrect: null }));
    const drill = createSession(db, sessionInput());
    createError(db, errorInput(writing.id));
    createError(db, errorInput(drill.id));
    expect(searchErrors(db, { withItemsOnly: true, limit: 10, offset: 0 }).rows.map((r) => r.session.id)).toEqual([drill.id]);
  });
});

describe('consecuencias de borrar una sesion', () => {
  it('cuenta sus errores, los convertidos, su texto y las reescrituras que pierden el vinculo', () => {
    const essay = createSession(db, sessionInput({ kind: 'WRITING', paper: 'WRITING', part: 1, itemsTotal: null, itemsCorrect: null }));
    const rewrite = createSession(db, sessionInput({ kind: 'WRITING', paper: 'WRITING', part: 1, itemsTotal: null, itemsCorrect: null }));
    const piece = createWritingPiece(db, { sessionId: essay.id, date: '2026-09-10', genre: 'ESSAY', wordCount: null, minutes: null, timed: false, rewriteOf: null, corrector: null, bandContent: null, bandCommunicative: null, bandOrganisation: null, bandLanguage: null });
    createWritingPiece(db, { sessionId: rewrite.id, date: '2026-09-11', genre: 'ESSAY', wordCount: null, minutes: null, timed: false, rewriteOf: piece.id, corrector: null, bandContent: null, bandCommunicative: null, bandOrganisation: null, bandLanguage: null });
    const converted = createError(db, errorInput(essay.id));
    createError(db, errorInput(essay.id, { itemRef: '9' }));
    linkAnkiNote(db, converted.id, {
      noteId: 30, model: 'Error Log C1', label: 'x', tags: [], category: null,
      firstSeenAt: '2026-09-12T18:00:00.000Z', lastSeenAt: '2026-09-12T18:00:00.000Z',
    }, '2026-09-12T18:00:00.000Z', 'huella');

    expect(sessionDeletionImpact(db, essay.id)).toEqual({ errors: 2, converted: 1, hasWritingPiece: true, rewrites: 1 });
    expect(sessionDeletionImpact(db, rewrite.id)).toEqual({ errors: 0, converted: 0, hasWritingPiece: true, rewrites: 0 });
  });
});
