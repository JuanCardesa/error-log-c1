import { describe, expect, it } from 'vitest';

import { AnswerStore, readValue } from '../src/dom/answers.js';

function textControl(id, value) {
  return { id, kind: 'text', elements: [{ value }] };
}

describe('lectura del valor de un hueco', () => {
  it('lee un campo de texto', () => {
    expect(readValue(textControl('c1', 'of'))).toBe('of');
  });

  it('lee el texto de la opcion elegida en un desplegable', () => {
    const control = { id: 'c1', kind: 'select', elements: [{ value: '2', selectedOptions: [{ textContent: 'off' }] }] };
    expect(readValue(control)).toBe('off');
  });

  it('lee la opcion marcada de un grupo de botones', () => {
    const option = (value, checked) => ({ value, checked, id: '', closest: () => null });
    const control = { id: 'c1', kind: 'choice', elements: [option('A', false), option('B', true)] };
    expect(readValue(control)).toBe('B');
  });

  it('un hueco vacio se lee como vacio, no como ausente', () => {
    expect(readValue(textControl('c1', ''))).toBe('');
  });
});

describe('custodia de mi respuesta original', () => {
  it('conserva lo que escribi cuando «mostrar respuestas» pisa el hueco', () => {
    const control = textControl('c1', 'of');
    const store = new AnswerStore();

    store.remember('c1', 'of');
    store.freeze([control]);

    // La plataforma revela la solucion sobrescribiendo el campo.
    control.elements[0].value = 'off';
    store.observeReveal(control);

    expect(store.answerOf('c1')).toBe('of');
    expect(store.solutionOf('c1')).toBe('off');
  });

  it('despues de corregir, nada vuelve a tocar mi respuesta', () => {
    const control = textControl('c1', 'of');
    const store = new AnswerStore();
    store.remember('c1', 'of');
    store.freeze([control]);

    store.remember('c1', 'off');

    expect(store.answerOf('c1')).toBe('of');
  });

  it('si vuelvo a escribir tras corregir, ese valor no se toma por solucion', () => {
    const control = textControl('c1', 'of');
    const store = new AnswerStore();
    store.remember('c1', 'of');
    store.freeze([control]);

    // Escribo yo otra vez en el hueco antes de volver a corregir.
    control.elements[0].value = 'away';
    store.remember('c1', 'away');
    store.observeReveal(control);

    expect(store.solutionOf('c1')).toBe('');
    expect(store.answerOf('c1')).toBe('of');
  });

  it('sin revelacion posterior no se inventa una solucion', () => {
    const control = textControl('c1', 'of');
    const store = new AnswerStore();
    store.remember('c1', 'of');
    store.freeze([control]);
    store.observeReveal(control);

    expect(store.solutionOf('c1')).toBe('');
  });

  it('si el guion llega tarde, toma lo que hay al corregir y no finge mas', () => {
    const control = textControl('c1', 'of');
    const store = new AnswerStore();
    store.freeze([control]);

    expect(store.answerOf('c1')).toBe('of');
  });

  it('un intento nuevo empieza limpio', () => {
    const control = textControl('c1', 'of');
    const store = new AnswerStore();
    store.remember('c1', 'of');
    store.freeze([control]);
    store.reset();

    expect(store.answerOf('c1')).toBe('');
    expect(store.frozen).toBe(false);
  });
});
