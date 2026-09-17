/**
 * Modelo de pregunta y render del enunciado.
 *
 * Una pregunta puede tener varios huecos. Exportamos una entrada por hueco fallado, pero
 * el enunciado se conserva entero y con todos los huecos numerados para que el fallo se
 * entienda sin volver al libro. El hueco concreto se identifica en `itemRef` (`3.2`).
 */

/** Espacios y saltos del HTML colapsados; el contenido no se toca. */
export function tidy(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** El hueco vacio del enunciado. Coincide con el que ya usa el error-log. */
const BLANK = '___';

/**
 * Enunciado completo con los huecos visibles.
 * Con un solo hueco queda `They called ___ the meeting.`
 * Con varios, cada uno se numera: `He ___(1) to ___(2) it.`
 */
export function renderPrompt(question) {
  const gaps = (question.segments ?? []).filter((segment) => segment.type === 'gap');
  const many = gaps.length > 1;
  let index = 0;
  const parts = (question.segments ?? []).map((segment) => {
    if (segment.type !== 'gap') return String(segment.text ?? '');
    index += 1;
    return many ? `${BLANK}(${String(index)})` : BLANK;
  });
  return cleanSeparators(tidy(parts.join('')));
}

/**
 * Los saltos de linea del libro se leen como « / ». Al quitarlos del principio y del
 * final, y al no repetirlos, el enunciado queda como se lee en la pagina.
 */
function cleanSeparators(text) {
  return text
    .replace(/(\s*\/\s*){2,}/g, ' / ')
    .replace(/^\s*\/\s*/, '')
    .replace(/\s*\/\s*$/, '')
    .trim();
}

/** Posicion del hueco dentro de su pregunta, contando solo huecos. */
export function gapPosition(question, controlId) {
  let index = 0;
  for (const segment of question.segments ?? []) {
    if (segment.type !== 'gap') continue;
    index += 1;
    if (segment.controlId === controlId) return index;
  }
  return 0;
}

/** Cuenta de huecos de la pregunta. */
export function gapCount(question) {
  return (question.segments ?? []).filter((segment) => segment.type === 'gap').length;
}

/**
 * Referencia del item. Con varios huecos se sufija con el numero de hueco para que dos
 * fallos de la misma pregunta no se confundan ni se dedupliquen entre si.
 */
export function itemRefFor(question, controlId) {
  const base = tidy(question.itemRef ?? '');
  if (gapCount(question) <= 1) return base;
  const position = gapPosition(question, controlId);
  if (position === 0) return base;
  return base === '' ? `.${String(position)}` : `${base}.${String(position)}`;
}

/**
 * Contexto que acompana al fallo: instrucciones del ejercicio y texto u opciones
 * asociadas, solo cuando existen. Se deja fuera la navegacion y los botones.
 */
export function contextOf(question) {
  const pieces = [tidy(question.instructions ?? ''), tidy(question.context ?? '')];
  return pieces.filter((piece) => piece !== '').join(' — ');
}

/** Recuento para la cabecera de la sesion. Nunca entra en el listado de errores. */
export function summarize(controls, verdicts) {
  let correct = 0;
  let incorrect = 0;
  let pending = 0;
  for (const control of controls) {
    const verdict = verdicts.get(control.id);
    if (verdict === 'correct') correct += 1;
    else if (verdict === 'incorrect') incorrect += 1;
    else pending += 1;
  }
  return { checked: correct + incorrect, correct, incorrect, pending };
}
