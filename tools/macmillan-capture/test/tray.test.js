import { describe, expect, it } from 'vitest';

import {
  addToTray, confirmAnswers, describeTray, markDone, MAX_TRAY, trayStats,
} from '../src/core/tray.js';

const entry = (mark, activityKey = 'act-1', row = {}) => ({
  mark, activityKey, gapId: `gap-${mark}`, row: { itemRef: mark, myAnswer: 'mia', correctAnswer: '', ruleNote: '', ...row },
});

describe('acumular fallos de varias actividades', () => {
  it('guarda lo nuevo y respeta el orden', () => {
    const { tray, added } = addToTray([], new Set(), [entry('a'), entry('b')]);
    expect(added).toBe(2);
    expect(tray.map((item) => item.mark)).toEqual(['a', 'b']);
  });

  it('no mete dos veces el mismo fallo', () => {
    const first = addToTray([], new Set(), [entry('a')]);
    const second = addToTray(first.tray, new Set(), [entry('a'), entry('b')]);
    expect(second.added).toBe(1);
    expect(second.tray.map((item) => item.mark)).toEqual(['a', 'b']);
  });

  it('no recupera lo que ya se copio', () => {
    const { tray, added } = addToTray([], new Set(['a']), [entry('a'), entry('b')]);
    expect(added).toBe(1);
    expect(tray.map((item) => item.mark)).toEqual(['b']);
  });

  it('completa una fila ya guardada cuando despues aparece la solucion', () => {
    const first = addToTray([], new Set(), [entry('a')]);
    const later = addToTray(first.tray, new Set(), [entry('a', 'act-1', { correctAnswer: 'off' })]);

    expect(later.added).toBe(0);
    expect(later.updated).toBe(1);
    expect(later.tray).toHaveLength(1);
    expect(later.tray[0].row.correctAnswer).toBe('off');
  });

  it('nunca pisa un dato que ya tenia', () => {
    const first = addToTray([], new Set(), [entry('a', 'act-1', { correctAnswer: 'off' })]);
    const later = addToTray(first.tray, new Set(), [entry('a', 'act-1', { correctAnswer: 'otra' })]);

    expect(later.updated).toBe(0);
    expect(later.tray[0].row.correctAnswer).toBe('off');
  });

  it('cuenta fallos y actividades por separado', () => {
    const { tray } = addToTray([], new Set(), [entry('a', 'act-1'), entry('b', 'act-1'), entry('c', 'act-2')]);
    expect(trayStats(tray)).toEqual({ count: 3, activities: 2 });
  });

  it('avisa cuando se llena en vez de crecer sin limite', () => {
    const many = Array.from({ length: MAX_TRAY + 5 }, (_, index) => entry(`m${String(index)}`));
    const { tray, added, full } = addToTray([], new Set(), many);
    expect(tray).toHaveLength(MAX_TRAY);
    expect(added).toBe(MAX_TRAY);
    expect(full).toBe(true);
  });
});

describe('entrega de la tanda completa', () => {
  it('lo despachado no vuelve a entrar', () => {
    const { tray } = addToTray([], new Set(), [entry('a'), entry('b')]);
    const done = markDone(new Set(), tray.map((item) => item.mark));
    const again = addToTray([], done, [entry('a'), entry('b')]);
    expect(again.added).toBe(0);
  });
});

describe('texto de la bandeja', () => {
  it('dice que esta vacia sin dar a entender que hubo un fallo', () => {
    expect(describeTray([])).toMatch(/vacia/i);
  });

  it('usa el singular con un solo fallo de una sola actividad', () => {
    const { tray } = addToTray([], new Set(), [entry('a')]);
    expect(describeTray(tray)).toBe('Bandeja: 1 fallo guardado de 1 actividad.');
  });

  it('resume cuantos fallos y de cuantas actividades', () => {
    const { tray } = addToTray([], new Set(), [entry('a', 'act-1'), entry('b', 'act-2')]);
    expect(describeTray(tray)).toBe('Bandeja: 2 fallos guardados de 2 actividades.');
  });
});

describe('la plataforma confirma la solucion al reintentar', () => {
  const fallo = () => addToTray([], new Set(), [entry('a')]).tray;

  it('rellena la solucion del fallo guardado con el valor que Macmillan da por bueno', () => {
    const { tray, updated } = confirmAnswers(fallo(), 'act-1', new Map([['gap-a', 'buena']]));

    expect(updated).toBe(1);
    expect(tray[0].row.correctAnswer).toBe('buena');
    expect(tray[0].row.myAnswer).toBe('mia');
  });

  it('no pisa una solucion que ya tenia', () => {
    const tray = addToTray([], new Set(), [entry('a', 'act-1', { correctAnswer: 'ya estaba' })]).tray;
    const result = confirmAnswers(tray, 'act-1', new Map([['gap-a', 'otra']]));

    expect(result.updated).toBe(0);
    expect(result.tray[0].row.correctAnswer).toBe('ya estaba');
  });

  it('no toca fallos de otra actividad aunque coincida el hueco', () => {
    const result = confirmAnswers(fallo(), 'act-2', new Map([['gap-a', 'buena']]));

    expect(result.updated).toBe(0);
    expect(result.tray[0].row.correctAnswer).toBe('');
  });

  it('ignora una confirmacion igual a mi respuesta fallada, que seria contradictoria', () => {
    const result = confirmAnswers(fallo(), 'act-1', new Map([['gap-a', 'mia']]));

    expect(result.updated).toBe(0);
    expect(result.tray[0].row.correctAnswer).toBe('');
  });

  it('sin confirmaciones deja la bandeja tal cual', () => {
    const tray = fallo();
    const result = confirmAnswers(tray, 'act-1', new Map());

    expect(result.updated).toBe(0);
    expect(result.tray).toBe(tray);
  });
});
