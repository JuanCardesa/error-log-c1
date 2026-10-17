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
import { errorRow, session, writingAnnotation, writingPiece } from './schema';
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
  it('acepta practica sin formato, tambien con cero items', () => {
    expect(() => insertSession({ paper: null, part: null })).not.toThrow();
    expect(() => insertSession({ paper: null, part: null, itemsTotal: 0, itemsCorrect: 0 })).not.toThrow();
  });

  it.each([
    { paper: null, part: 1 },
    { paper: 'RUOE', part: null },
    { paper: 'NINGUNO', part: 1 },
    { paper: 'NINGUNO', part: null },
    { paper: null, part: null, kind: 'WRITING' },
    { paper: null, part: null, itemsTotal: null },
    { paper: null, part: null, itemsCorrect: null },
    { paper: 'RUOE', part: 1.5 },
  ])('rechaza tambien sin Zod los datos invalidos: %j', (overrides) => {
    expect(() => insertSession(overrides)).toThrow(/CHECK/i);
  });

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

  it('admite medios puntos y rechaza cualquier otro decimal', () => {
    const piece = db.insert(writingPiece)
      .values({ sessionId: writingSession(), date: '2026-09-13', genre: 'ESSAY', bandLanguage: 2.5, bandContent: 4 })
      .returning().get();
    expect(piece).toMatchObject({ bandLanguage: 2.5, bandContent: 4 });
    expect(() => db.update(writingPiece).set({ bandLanguage: 2.3 }).where(eq(writingPiece.id, piece.id)).run())
      .toThrow(/CHECK/i);
  });

  it('pone uid, estado, fecha de alta y revision por defecto', () => {
    const first = db.insert(writingPiece).values({ sessionId: writingSession(), date: '2026-09-13', genre: 'ESSAY' }).returning().get();
    const second = db.insert(writingPiece).values({ sessionId: writingSession(), date: '2026-09-13', genre: 'ESSAY' }).returning().get();
    expect(first.uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.uid).not.toBe(second.uid);
    expect(first).toMatchObject({ status: 'AWAITING', dateBasis: 'WRITTEN', textRevision: 1, originalText: null });
    expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(() => db.insert(writingPiece).values({ sessionId: writingSession(), date: '2026-09-13', genre: 'ESSAY', uid: first.uid }).run())
      .toThrow(/UNIQUE/i);
  });

  it('exige la huella exactamente cuando hay texto, y textos no vacios', () => {
    const base = { date: '2026-09-13', genre: 'ESSAY' as const };
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), originalText: 'Dear Sir,' }).run())
      .toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), textFingerprint: 'abc' }).run())
      .toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), originalText: '   ', textFingerprint: 'abc' }).run())
      .toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), title: ' ' }).run()).toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), originalText: 'Dear Sir,', textFingerprint: 'abc' }).run())
      .not.toThrow();
  });

  it('rechaza estados desconocidos, correcciones anteriores al texto y rangos de palabras a medias', () => {
    const base = { date: '2026-09-13', genre: 'ESSAY' as const };
    const raw = db.$client;
    expect(() => raw.prepare("INSERT INTO writing_piece (session_id, date, genre, status) VALUES (?, '2026-09-13', 'ESSAY', 'DONE')")
      .run(writingSession())).toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), correctedOn: '2026-09-12' }).run())
      .toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), wordMin: 220 }).run()).toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), wordMin: 260, wordMax: 220 }).run())
      .toThrow(/CHECK/i);
    expect(() => db.insert(writingPiece).values({ ...base, sessionId: writingSession(), wordMin: 180, wordMax: 220, correctedOn: '2026-09-13' }).run())
      .not.toThrow();
  });
});

describe('invariantes de writing_annotation en la propia base', () => {
  const at = '2026-09-14T10:00:00.000Z';
  const anchor = { start: 0, end: 4, exact: 'Dear', prefix: '', suffix: ' Sir,' };
  let pieceId: number;
  let next = 0;

  beforeEach(() => {
    const sessionId = insertSession({ kind: 'WRITING', paper: 'WRITING', part: 2, itemsTotal: null, itemsCorrect: null });
    pieceId = db.insert(writingPiece)
      .values({ sessionId, date: '2026-09-13', genre: 'LETTER', originalText: 'Dear Sir,', textFingerprint: 'f' })
      .returning().get().id;
  });

  function annotation(overrides: Partial<typeof writingAnnotation.$inferInsert> = {}) {
    next += 1;
    return {
      id: `a-${String(next)}`, pieceId, kind: 'ERROR' as const, source: 'PROFESOR' as const, scope: 'SPAN' as const,
      anchor, comment: 'Use the name if you know it.', createdAt: at, updatedAt: at, ...overrides,
    };
  }
  const insert = (overrides: Partial<typeof writingAnnotation.$inferInsert> = {}) =>
    () => db.insert(writingAnnotation).values(annotation(overrides)).run();

  it('acepta fragmentos, fragmentos sin colocar, parrafos y el texto entero', () => {
    expect(insert()).not.toThrow();
    expect(insert({ anchor: null, quote: 'Dear Sirs', paragraph: 1 })).not.toThrow();
    expect(insert({ scope: 'PARAGRAPH', anchor: null, paragraph: 1, kind: 'COMMENT' })).not.toThrow();
    expect(insert({ scope: 'DOCUMENT', anchor: null, kind: 'IMPROVEMENT', source: 'IA' })).not.toThrow();
  });

  it('exige el destino que corresponde a cada alcance', () => {
    expect(insert({ anchor: null })).toThrow(/CHECK/i);
    expect(insert({ scope: 'PARAGRAPH', anchor: null })).toThrow(/CHECK/i);
    expect(insert({ scope: 'PARAGRAPH', paragraph: 1 })).toThrow(/CHECK/i);
    expect(insert({ scope: 'DOCUMENT' })).toThrow(/CHECK/i);
    expect(insert({ scope: 'DOCUMENT', anchor: null, quote: 'Dear' })).toThrow(/CHECK/i);
    expect(insert({ scope: 'PARAGRAPH', anchor: null, paragraph: 0 })).toThrow(/CHECK/i);
  });

  it('exige algo que estudiar: comentario, correccion o, en un acierto, su foco', () => {
    expect(insert({ comment: null })).toThrow(/CHECK/i);
    expect(insert({ comment: null, suggestion: 'Dear Mr Smith' })).not.toThrow();
    expect(insert({ comment: null, kind: 'STRENGTH' })).toThrow(/CHECK/i);
    expect(insert({ comment: null, kind: 'STRENGTH', focus: 'REGISTER' })).not.toThrow();
    expect(insert({ comment: '  ' })).toThrow(/CHECK/i);
  });

  it('rechaza valores fuera de las listas cerradas y anclajes mal formados', () => {
    const raw = (column: string, value: string) => () => db.$client
      .prepare(`INSERT INTO writing_annotation (id, piece_id, kind, source, scope, anchor, comment, created_at, updated_at, ${column})
        VALUES (?, ?, 'ERROR', 'PROFESOR', 'SPAN', ?, 'x', ?, ?, ?)`)
      .run(`raw-${column}-${value}`, pieceId, JSON.stringify(anchor), at, at, value);
    expect(raw('focus', 'STYLE')).toThrow(/CHECK/i);
    expect(() => db.$client.prepare(`INSERT INTO writing_annotation (id, piece_id, kind, source, scope, anchor, comment, created_at, updated_at)
      VALUES ('raw-kind', ?, 'MISTAKE', 'PROFESOR', 'SPAN', ?, 'x', ?, ?)`).run(pieceId, JSON.stringify(anchor), at, at)).toThrow(/CHECK/i);
    expect(insert({ anchor: { ...anchor, end: 0 } })).toThrow(/CHECK/i);
    expect(insert({ anchor: { ...anchor, exact: '' } })).toThrow(/CHECK/i);
  });

  it('no repite una importacion en el mismo texto y se borra con el texto', () => {
    expect(insert({ importKey: 'k1' })).not.toThrow();
    expect(insert({ importKey: 'k1' })).toThrow(/UNIQUE/i);
    expect(insert({ importKey: null })).not.toThrow();
    expect(insert({ importKey: null })).not.toThrow();
    db.delete(writingPiece).where(eq(writingPiece.id, pieceId)).run();
    expect(db.select().from(writingAnnotation).all()).toEqual([]);
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
