import { describe, expect, it } from 'vitest';

import { checkRewriteLink } from './rewriteChain';
import { errorInputSchema, sessionInputSchema, writingPieceInputSchema } from './schemas';

const TODAY = '2026-09-14';
const session = sessionInputSchema({ today: TODAY });
const error = errorInputSchema();
const piece = writingPieceInputSchema({ today: TODAY });

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

function validError() {
  return {
    sessionId: 1,
    prompt: 'I only recognised him because of his voice. (WAS)',
    correctAnswer: 'it was only by his voice that I recognised him',
    cause: 'FORMATO' as const,
    category: 'ESTRUCTURA' as const,
    confidence: 'DUDABA' as const,
    ruleNote: 'En las cleft con it was... that, la preposicion no desaparece',
  };
}

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

describe('sesion', () => {
  it('acepta una sesion valida y aplica los defaults', () => {
    const result = session.safeParse(validSession());
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('OPEN');
    expect(result.data?.timed).toBe(false);
    expect(result.data?.sourceRef).toBeNull();
  });

  it('rechaza una fecha futura', () => {
    const result = session.safeParse({ ...validSession(), date: '2026-09-15' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('date');
  });

  it('acepta la fecha de hoy', () => {
    expect(session.safeParse({ ...validSession(), date: TODAY }).success).toBe(true);
  });

  it('rechaza una part fuera del maximo del paper', () => {
    expect(session.safeParse({ ...validSession(), paper: 'RUOE', part: 8 }).success).toBe(
      true,
    );
    const result = session.safeParse({ ...validSession(), paper: 'RUOE', part: 9 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('part');

    const listening = session.safeParse({
      ...validSession(),
      paper: 'LISTENING',
      part: 5,
    });
    expect(listening.success).toBe(false);
  });

  it('rechaza mas aciertos que intentos', () => {
    const result = session.safeParse({
      ...validSession(),
      itemsTotal: 6,
      itemsCorrect: 7,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('itemsCorrect');
  });

  it('acepta cero errores y cero aciertos', () => {
    expect(
      session.safeParse({ ...validSession(), itemsTotal: 8, itemsCorrect: 0 }).success,
    ).toBe(true);
  });

  it('obliga a declarar items salvo en Writing', () => {
    const ruoe = session.safeParse({
      ...validSession(),
      itemsTotal: null,
      itemsCorrect: null,
    });
    expect(ruoe.success).toBe(false);
    expect(issuePaths(ruoe)).toContain('itemsTotal');

    const writing = session.safeParse({
      ...validSession(),
      kind: 'WRITING',
      paper: 'WRITING',
      part: 1,
      itemsTotal: null,
      itemsCorrect: null,
    });
    expect(writing.success).toBe(true);
  });

  it('exige paper WRITING cuando el tipo es WRITING', () => {
    const result = session.safeParse({
      ...validSession(),
      kind: 'WRITING',
      paper: 'RUOE',
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('paper');
  });

  it('permite el Writing de un SIMULACRO (decision P4)', () => {
    const result = session.safeParse({
      ...validSession(),
      kind: 'SIMULACRO',
      paper: 'WRITING',
      part: 1,
      itemsTotal: null,
      itemsCorrect: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('error', () => {
  it('acepta un error valido', () => {
    expect(error.safeParse(validError()).success).toBe(true);
  });

  it('rechaza una regla demasiado corta', () => {
    const result = error.safeParse({ ...validError(), ruleNote: 'muy corta' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('ruleNote');
  });

  it('rechaza copiar la respuesta correcta en la regla', () => {
    const answer = 'it was only by his voice that I recognised him';
    const result = error.safeParse({
      ...validError(),
      correctAnswer: answer,
      ruleNote: answer,
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('ruleNote');
  });

  it('detecta la copia aunque cambie la caja o sobren espacios', () => {
    const answer = 'it was only by his voice that I recognised him';
    const result = error.safeParse({
      ...validError(),
      correctAnswer: answer,
      ruleNote: `  ${answer.toUpperCase()}  `,
    });
    expect(result.success).toBe(false);
  });

  it('normaliza los textos opcionales vacios a null', () => {
    const result = error.safeParse({ ...validError(), subcategory: '   ', myAnswer: '' });
    expect(result.data?.subcategory).toBeNull();
    expect(result.data?.myAnswer).toBeNull();
  });
});

describe('texto de writing', () => {
  it('acepta bandas entre 0 y 5 y rechaza fuera de rango', () => {
    const base = {
      sessionId: 1,
      date: '2026-09-10',
      genre: 'ESSAY' as const,
    };
    expect(piece.safeParse({ ...base, bandContent: 0 }).success).toBe(true);
    expect(piece.safeParse({ ...base, bandContent: 5 }).success).toBe(true);
    expect(piece.safeParse({ ...base, bandContent: 6 }).success).toBe(false);
    expect(piece.safeParse({ ...base, bandContent: -1 }).success).toBe(false);
  });

  it('deja las bandas sin puntuar como null', () => {
    const result = piece.safeParse({ sessionId: 1, date: '2026-09-10', genre: 'REPORT' });
    expect(result.data?.bandLanguage).toBeNull();
  });
});

describe('cadena de reescrituras', () => {
  const pieces = [
    { id: 1, rewriteOf: null },
    { id: 2, rewriteOf: 1 },
    { id: 3, rewriteOf: 2 },
  ];

  it('acepta no ser una reescritura', () => {
    expect(checkRewriteLink(pieces, 4, null).ok).toBe(true);
  });

  it('acepta enlazar a un texto anterior', () => {
    expect(checkRewriteLink(pieces, 4, 3).ok).toBe(true);
  });

  it('rechaza apuntarse a si mismo', () => {
    const result = checkRewriteLink(pieces, 2, 2);
    expect(result).toMatchObject({ ok: false, reason: 'self' });
  });

  it('rechaza un original inexistente', () => {
    expect(checkRewriteLink(pieces, 4, 99)).toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });

  it('rechaza un ciclo indirecto', () => {
    // 1 -> 3 cerraria 1 -> 3 -> 2 -> 1.
    expect(checkRewriteLink(pieces, 1, 3)).toMatchObject({ ok: false, reason: 'cycle' });
  });

  it('rechaza un ciclo ya existente en los datos sin colgarse', () => {
    const cyclic = [
      { id: 1, rewriteOf: 2 },
      { id: 2, rewriteOf: 1 },
    ];
    expect(checkRewriteLink(cyclic, 3, 1)).toMatchObject({ ok: false, reason: 'cycle' });
  });
});
