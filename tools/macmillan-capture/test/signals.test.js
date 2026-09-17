import { describe, expect, it } from 'vitest';

import { classifyAttribute, classifyToken, discoverVerdicts } from '../src/core/signals.js';

/** Control minimo: sin cambios respecto a la linea base. */
function control(id, overrides = {}) {
  return {
    id,
    answered: true,
    classesBefore: ['gap'],
    classesAfter: ['gap'],
    attrsBefore: [],
    attrsAfter: [],
    ariaInvalidBefore: null,
    ariaInvalidAfter: null,
    ...overrides,
  };
}

/** Control que recibe clases nuevas al corregir. */
function marked(id, ...tokens) {
  return control(id, { classesAfter: ['gap', ...tokens] });
}

describe('vocabulario de correccion', () => {
  it('lee las formas habituales de escribir acierto y fallo', () => {
    expect(classifyToken('correct')).toBe('correct');
    expect(classifyToken('is-correct')).toBe('correct');
    expect(classifyToken('answerCorrect')).toBe('correct');
    expect(classifyToken('answer--correct')).toBe('correct');
    expect(classifyToken('incorrect')).toBe('incorrect');
    expect(classifyToken('is-wrong')).toBe('incorrect');
    expect(classifyToken('answer_invalid')).toBe('incorrect');
  });

  it('no confunde `incorrect` con `correct`, que lo contiene', () => {
    expect(classifyToken('incorrect')).toBe('incorrect');
    expect(classifyToken('not-correct')).toBe('incorrect');
  });

  it('el color nunca es una senal', () => {
    for (const token of ['red', 'green', 'amber', 'bg-red-500', 'text-green', 'highlight-orange']) {
      expect(classifyToken(token)).toBeNull();
    }
  });

  it('ignora clases de maquetacion que no dicen nada', () => {
    for (const token of ['gap', 'input--large', 'question__field', 'ng-touched', 'ng-dirty']) {
      expect(classifyToken(token)).toBeNull();
    }
  });

  it('lee atributos de estado y respeta la negacion del nombre', () => {
    expect(classifyAttribute('aria-invalid', 'true')).toBe('incorrect');
    expect(classifyAttribute('aria-invalid', 'false')).toBe('correct');
    expect(classifyAttribute('data-correct', 'false')).toBe('incorrect');
    expect(classifyAttribute('data-correct', 'true')).toBe('correct');
    expect(classifyAttribute('data-result', 'wrong')).toBe('incorrect');
    expect(classifyAttribute('data-state', 'correct')).toBe('correct');
  });

  it('no inventa veredicto desde atributos ajenos a la correccion', () => {
    expect(classifyAttribute('data-index', 'true')).toBeNull();
    expect(classifyAttribute('placeholder', 'correct')).toBeNull();
  });
});

describe('descubrimiento del veredicto', () => {
  it('sin controles no hay nada que leer', () => {
    expect(discoverVerdicts([])).toEqual({ ok: false, reason: 'empty' });
  });

  it('si nada ha cambiado, el ejercicio sigue sin corregir', () => {
    const found = discoverVerdicts([control('a'), control('b')]);
    expect(found).toEqual({ ok: false, reason: 'uncorrected' });
  });

  it('un ejercicio entero correcto se lee como tal, no como fallo de lectura', () => {
    const found = discoverVerdicts([marked('a', 'correct'), marked('b', 'correct')]);
    expect(found.ok).toBe(true);
    expect([...found.verdicts.values()]).toEqual(['correct', 'correct']);
  });

  it('separa aciertos de fallos', () => {
    const found = discoverVerdicts([marked('a', 'correct'), marked('b', 'incorrect'), marked('c', 'correct')]);
    expect(found.ok).toBe(true);
    expect(found.verdicts.get('b')).toBe('incorrect');
    expect(found.verdicts.get('a')).toBe('correct');
  });

  it('usa aria-invalid, que es el estandar, cuando las clases no dicen nada', () => {
    const found = discoverVerdicts([
      control('a', { ariaInvalidAfter: 'true', classesAfter: ['gap', 'answered'] }),
    ]);
    expect(found.ok).toBe(true);
    expect(found.source).toBe('aria-invalid');
    expect(found.verdicts.get('a')).toBe('incorrect');
  });

  it('acepta aria y clases cuando coinciden', () => {
    const found = discoverVerdicts([
      control('a', { ariaInvalidAfter: 'true', classesAfter: ['gap', 'incorrect'] }),
      control('b', { ariaInvalidAfter: 'false', classesAfter: ['gap', 'correct'] }),
    ]);
    expect(found.ok).toBe(true);
    expect(found.verdicts.get('a')).toBe('incorrect');
    expect(found.verdicts.get('b')).toBe('correct');
  });

  it('si aria y las clases se contradicen en el mismo hueco, no se elige ganador', () => {
    const found = discoverVerdicts([
      control('a', { ariaInvalidAfter: 'true', classesAfter: ['gap', 'correct'] }),
    ]);
    expect(found).toEqual({ ok: false, reason: 'conflict' });
  });

  it('si cambia algo pero no es clasificable, el formato no esta soportado', () => {
    const found = discoverVerdicts([marked('a', 'bg-red-500'), marked('b', 'bg-green-500')]);
    expect(found).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('si queda una respuesta mia sin veredicto, no exporta de menos', () => {
    const found = discoverVerdicts([marked('a', 'correct'), control('b')]);
    expect(found).toEqual({ ok: false, reason: 'partial' });
  });

  it('una respuesta en blanco sin marcar no rompe la lectura', () => {
    const found = discoverVerdicts([marked('a', 'incorrect'), control('b', { answered: false })]);
    expect(found.ok).toBe(true);
    expect(found.verdicts.has('b')).toBe(false);
  });

  it('dos senales que se contradicen no producen veredicto', () => {
    const found = discoverVerdicts([
      control('a', { ariaInvalidAfter: 'true', attrsAfter: [{ name: 'data-result', value: 'correct' }] }),
      control('b', { ariaInvalidAfter: 'false', attrsAfter: [{ name: 'data-result', value: 'correct' }] }),
    ]);
    expect(found).toEqual({ ok: false, reason: 'conflict' });
  });

  it('un hueco cuyas clases dicen acierto y fallo a la vez invalida la lectura entera', () => {
    // Aunque aria clasifique los dos huecos sin problema, una senal que se contradice a
    // si misma significa que no entendemos el formato. No decide otra por ella.
    const found = discoverVerdicts([
      control('a', { classesAfter: ['gap', 'correct', 'incorrect'], ariaInvalidAfter: 'true' }),
      control('b', { ariaInvalidAfter: 'false' }),
    ]);
    expect(found).toEqual({ ok: false, reason: 'conflict' });
  });

  it('lo mismo con atributos de estado que se contradicen entre si', () => {
    const found = discoverVerdicts([
      control('a', {
        attrsAfter: [{ name: 'data-result', value: 'correct' }, { name: 'data-state', value: 'wrong' }],
      }),
    ]);
    expect(found).toEqual({ ok: false, reason: 'conflict' });
  });

  it('no toma por senal una clase que ya estaba antes de corregir', () => {
    const found = discoverVerdicts([
      control('a', { classesBefore: ['gap', 'correct'], classesAfter: ['gap', 'correct'] }),
    ]);
    expect(found).toEqual({ ok: false, reason: 'uncorrected' });
  });
});
