import { migrate } from './migrate';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  ErrorInput,
  SessionInput,
  WritingPieceInput,
} from '../validation/schemas';
import { type Db, createDb } from './client';
import { MIGRATIONS_DIR } from './paths';
import {
  countErrors,
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
  createWritingPiece,
  deleteWritingPiece,
  getWritingPiece,
  listWritingPieces,
  markAnkiAdded,
  setSessionStatus,
  updateWritingPiece,
  writingSessionsWithoutPiece,
  unmarkAnkiAdded,
  updateError,
  updateSession,
} from './repo';
import { writingPiece } from './schema';

let db: Db;

function sessionInput(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
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
  };
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
    ankiAdded: false,
    ankiAddedAt: null,
    secs: 25,
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
    expect(countErrors(db, created.id)).toBe(1);

    deleteSession(db, created.id);
    expect(getSession(db, created.id)).toBeNull();
    expect(listErrors(db, created.id)).toEqual([]);
  });
});

describe('errores', () => {
  it('crea, lista y cuenta', () => {
    const session = createSession(db, sessionInput());
    createError(db, errorInput(session.id));
    createError(db, errorInput(session.id, { itemRef: '7' }));

    expect(listErrors(db, session.id)).toHaveLength(2);
    expect(countErrors(db, session.id)).toBe(2);
  });

  it('cuenta cero en una sesion sin errores', () => {
    const session = createSession(db, sessionInput());
    expect(countErrors(db, session.id)).toBe(0);
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

    deleteError(db, created.id);
    expect(listErrors(db, session.id)).toEqual([]);
  });
});

describe('conversion a tarjeta', () => {
  it('sella la fecha al marcar y la limpia al desmarcar', () => {
    const session = createSession(db, sessionInput());
    const created = createError(db, errorInput(session.id));

    markAnkiAdded(db, created.id, '2026-09-12T18:00:00.000Z');
    const marked = listErrors(db, session.id)[0];
    expect(marked?.ankiAdded).toBe(true);
    expect(marked?.ankiAddedAt).toBe('2026-09-12T18:00:00.000Z');

    unmarkAnkiAdded(db, created.id);
    const cleared = listErrors(db, session.id)[0];
    expect(cleared?.ankiAdded).toBe(false);
    // El CHECK de la base exige que no quede fecha huerfana.
    expect(cleared?.ankiAddedAt).toBeNull();
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
