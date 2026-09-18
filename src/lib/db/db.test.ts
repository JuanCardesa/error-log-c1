import { eq } from 'drizzle-orm';
import { migrate } from './migrate';
import { beforeEach, describe, expect, it } from 'vitest';

import { q1CauseSplit } from '../queries/q1CauseSplit';
import { q2CategoryRate } from '../queries/q2CategoryRate';
import { q5AnkiDebt } from '../queries/q5AnkiDebt';
import { q6RewriteEfficacy } from '../queries/q6RewriteEfficacy';
import { type Db, createDb } from './client';
import { loadDataset } from './load';
import { MIGRATIONS_DIR } from './paths';
import { errorRow, session, writingPiece } from './schema';
import { seed } from './seed';

const TODAY = new Date('2026-09-14T12:00:00Z');

let db: Db;

function freshDb(): Db {
  const created = createDb(':memory:');
  migrate(created, { migrationsFolder: MIGRATIONS_DIR });
  return created;
}

function validSession() {
  return {
    date: '2026-09-13',
    kind: 'DRILL' as const,
    paper: 'RUOE' as const,
    part: 4,
    source: 'LIBRO' as const,
    itemsTotal: 6,
    itemsCorrect: 3,
  };
}

function insertSession(overrides: Record<string, unknown> = {}): number {
  const [row] = db
    .insert(session)
    .values({ ...validSession(), ...overrides })
    .returning({ id: session.id })
    .all();
  if (row === undefined) throw new Error('sin id');
  return row.id;
}

beforeEach(() => {
  db = freshDb();
});

describe('migraciones', () => {
  it('crean las tres tablas', () => {
    expect(() => db.select().from(session).all()).not.toThrow();
    expect(() => db.select().from(errorRow).all()).not.toThrow();
    expect(() => db.select().from(writingPiece).all()).not.toThrow();
  });
});

describe('invariantes de session en la propia base', () => {
  it('rechaza acertar mas items de los intentados', () => {
    expect(() => insertSession({ itemsTotal: 6, itemsCorrect: 7 })).toThrow(/CHECK/i);
  });

  it('rechaza items negativos', () => {
    expect(() => insertSession({ itemsTotal: -1, itemsCorrect: 0 })).toThrow(/CHECK/i);
  });

  it('rechaza una part por encima del maximo del paper', () => {
    expect(() => insertSession({ paper: 'RUOE', part: 9 })).toThrow(/CHECK/i);
    expect(() => insertSession({ paper: 'LISTENING', part: 5 })).toThrow(/CHECK/i);
    expect(() => insertSession({ paper: 'SPEAKING', part: 0 })).toThrow(/CHECK/i);
  });

  it('acepta la part maxima de cada paper', () => {
    expect(() => insertSession({ paper: 'RUOE', part: 8 })).not.toThrow();
    expect(() => insertSession({ paper: 'LISTENING', part: 4 })).not.toThrow();
  });

  it('obliga a declarar items fuera de Writing', () => {
    expect(() =>
      insertSession({ itemsTotal: null, itemsCorrect: null }),
    ).toThrow(/CHECK/i);
  });

  it('permite Writing sin items', () => {
    expect(() =>
      insertSession({
        kind: 'WRITING',
        paper: 'WRITING',
        part: 1,
        itemsTotal: null,
        itemsCorrect: null,
      }),
    ).not.toThrow();
  });

  it('rechaza kind WRITING en un paper que no es WRITING', () => {
    expect(() => insertSession({ kind: 'WRITING', paper: 'RUOE' })).toThrow(/CHECK/i);
  });

  it('permite el Writing de un SIMULACRO (decision P4)', () => {
    expect(() =>
      insertSession({
        kind: 'SIMULACRO',
        paper: 'WRITING',
        part: 1,
        itemsTotal: null,
        itemsCorrect: null,
      }),
    ).not.toThrow();
  });
});

describe('invariantes de error_row en la propia base', () => {
  function validError(sessionId: number) {
    return {
      sessionId,
      prompt: 'The company has ______ a significant loss',
      correctAnswer: 'sustained',
      cause: 'CONFUSION' as const,
      category: 'COLOCACION' as const,
      confidence: 'SEGURO' as const,
      ruleNote: 'sustain a loss es la colocacion formal, suffer es mas general',
    };
  }

  it('rechaza una regla de menos de 15 caracteres', () => {
    const sessionId = insertSession();
    expect(() =>
      db.insert(errorRow).values({ ...validError(sessionId), ruleNote: 'corta' }).run(),
    ).toThrow(/CHECK/i);
  });

  it('rechaza copiar la respuesta correcta en la regla', () => {
    const sessionId = insertSession();
    expect(() =>
      db
        .insert(errorRow)
        .values({
          ...validError(sessionId),
          correctAnswer: 'una respuesta larga de sobra',
          ruleNote: 'una respuesta larga de sobra',
        })
        .run(),
    ).toThrow(/CHECK/i);
  });

  it('exige fecha de conversion cuando se marca como añadida a Anki', () => {
    const sessionId = insertSession();
    expect(() =>
      db
        .insert(errorRow)
        .values({ ...validError(sessionId), ankiAdded: true, ankiAddedAt: null })
        .run(),
    ).toThrow(/CHECK/i);
  });

  it('borra en cascada los errores al borrar su sesion', () => {
    const sessionId = insertSession();
    db.insert(errorRow).values(validError(sessionId)).run();
    expect(db.select().from(errorRow).all()).toHaveLength(1);

    db.delete(session).where(eq(session.id, sessionId)).run();
    expect(db.select().from(errorRow).all()).toHaveLength(0);
  });
});

describe('invariantes de writing_piece en la propia base', () => {
  function writingSession(): number {
    return insertSession({
      kind: 'WRITING',
      paper: 'WRITING',
      part: 1,
      itemsTotal: null,
      itemsCorrect: null,
    });
  }

  it('admite un solo texto por sesion (decision P1)', () => {
    const sessionId = writingSession();
    db.insert(writingPiece).values({ sessionId, date: '2026-09-13', genre: 'ESSAY' }).run();

    expect(() =>
      db
        .insert(writingPiece)
        .values({ sessionId, date: '2026-09-13', genre: 'REPORT' })
        .run(),
    ).toThrow(/UNIQUE/i);
  });

  it('rechaza bandas fuera de 0-5', () => {
    const sessionId = writingSession();
    expect(() =>
      db
        .insert(writingPiece)
        .values({ sessionId, date: '2026-09-13', genre: 'ESSAY', bandLanguage: 6 })
        .run(),
    ).toThrow(/CHECK/i);
  });

  it('rechaza que un texto se reescriba a si mismo', () => {
    const sessionId = writingSession();
    const [piece] = db
      .insert(writingPiece)
      .values({ sessionId, date: '2026-09-13', genre: 'ESSAY' })
      .returning({ id: writingPiece.id })
      .all();
    if (piece === undefined) throw new Error('sin id');

    expect(() =>
      db
        .update(writingPiece)
        .set({ rewriteOf: piece.id })
        .where(eq(writingPiece.id, piece.id))
        .run(),
    ).toThrow(/CHECK/i);
  });
});

describe('seed', () => {
  it('inserta el conjunto completo', () => {
    const result = seed(db, TODAY);
    expect(result.sessions).toBe(12);
    expect(result.errors).toBe(27);
    expect(result.pieces).toBe(2);
  });

  it('incluye una sesion sin errores, que cuenta en el denominador', () => {
    seed(db, TODAY);
    const data = loadDataset(db);

    const errorsBySession = new Map<number, number>();
    for (const error of data.errors) {
      errorsBySession.set(error.sessionId, (errorsBySession.get(error.sessionId) ?? 0) + 1);
    }

    const empty = data.sessions.filter((s) => !errorsBySession.has(s.id));
    expect(empty).toHaveLength(1);
    expect(empty[0]?.itemsCorrect).toBe(empty[0]?.itemsTotal);

    // Y sus items entran en el denominador de Q2.
    const withEmpty = q2CategoryRate(data, { now: TODAY, windowDays: 30 });
    const withoutEmpty = q2CategoryRate(
      { ...data, sessions: data.sessions.filter((s) => errorsBySession.has(s.id)) },
      { now: TODAY, windowDays: 30 },
    );
    expect(withEmpty.itemsAttempted).toBeGreaterThan(withoutEmpty.itemsAttempted);
  });

  it('devuelve tipos de dominio, no enteros crudos de SQLite', () => {
    seed(db, TODAY);
    const data = loadDataset(db);

    const timed = data.sessions.find((s) => s.timed);
    expect(timed?.timed).toBe(true);

    const added = data.errors.find((e) => e.ankiAdded);
    expect(added?.ankiAdded).toBe(true);
    expect(typeof added?.ankiAddedAt).toBe('string');

    const notAdded = data.errors.find((e) => !e.ankiAdded);
    expect(notAdded?.ankiAddedAt).toBeNull();
  });

  it('produce datos suficientes para que el informe diga algo', () => {
    seed(db, TODAY);
    const data = loadDataset(db);
    const opts = { now: TODAY, windowDays: 30 };

    // Por encima de MIN_N: las reglas de porcentaje pueden evaluarse.
    expect(q1CauseSplit(data, opts).total).toBeGreaterThanOrEqual(15);

    // Hay deuda de Anki real, ni 0% ni 100%.
    const anki = q5AnkiDebt(data, opts);
    expect(anki.eligible).toBeGreaterThan(0);
    expect(anki.pctConverted).toBeGreaterThan(0);
    expect(anki.pctConverted).toBeLessThan(100);

    // Y hay un par original/reescritura con un error repetido.
    const rewrite = q6RewriteEfficacy(data, opts);
    expect(rewrite.pairs).toHaveLength(1);
    expect(rewrite.totalRepeated).toBe(1);
  });

  it('no deja ninguna sesion de Writing con items contabilizados', () => {
    seed(db, TODAY);
    const data = loadDataset(db);
    for (const s of data.sessions) {
      if (s.paper === 'WRITING') expect(s.itemsTotal).toBeNull();
      else expect(s.itemsTotal).not.toBeNull();
    }
  });
});
