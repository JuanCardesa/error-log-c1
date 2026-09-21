/**
 * Paso del ejercicio corregido al contrato real del importador del error-log.
 *
 * Lo que este modulo NO hace, a proposito:
 * - No propone `category`: la eligo yo en la vista previa.
 * - No escribe `ruleNote` de su cosecha. Solo copia la explicacion si la da la
 *   plataforma; si no, queda vacia. Una regla nuestra no se atribuye a Macmillan.
 * - No manda `cause` ni `confidence`: el importador propone sus valores por defecto y
 *   yo los reviso. Mi estado mental no se deduce de una respuesta fallada.
 * - No marca tarjetas de Anki.
 * - No asigna paper ni part: eso vive en la cabecera de la sesion.
 */

import { contextOf, itemRefFor, renderPrompt, tidy } from './items.js';

export const MAX_EXPORT_LENGTH = 200_000;

/** Hash estable y corto para el control de duplicados. FNV-1a, sin dependencias. */
export function fingerprint(parts) {
  const text = parts.join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * La explicacion solo entra si la da la plataforma y aporta algo. Si coincide con la
 * solucion, el error-log la rechazaria al guardar, asi que se deja vacia para que la
 * escriba yo con mis palabras en la vista previa.
 */
function ruleNoteFrom(explanation, correctAnswer) {
  const note = tidy(explanation ?? '');
  if (note === '') return '';
  if (note.toLowerCase() === correctAnswer.toLowerCase()) return '';
  return note;
}

/**
 * Convierte los huecos fallados en filas del importador.
 * Solo entran los veredictos `incorrect`. Un acierto o un hueco sin corregir no genera
 * entrada bajo ninguna circunstancia.
 */
/**
 * Lo mismo, pero sin perder de que hueco sale cada fila.
 *
 * El identificador del hueco no viaja en el JSON, que solo lleva el contrato del
 * importador. Se queda dentro para poder reconocer ese mismo hueco en otro intento y
 * completar la solucion cuando la plataforma la confirme.
 */
export function toImportEntries(capture) {
  const { questions = [], verdicts = new Map(), answers = new Map(), solutions = new Map(), explanations = new Map() } = capture;
  const rows = [];
  for (const question of questions) {
    const context = contextOf(question);
    const prompt = renderPrompt(question);
    for (const segment of question.segments ?? []) {
      if (segment.type !== 'gap') continue;
      if (verdicts.get(segment.controlId) !== 'incorrect') continue;
      const correctAnswer = tidy(solutions.get(segment.controlId) ?? '');
      rows.push({
        gapId: segment.controlId,
        row: {
          itemRef: itemRefFor(question, segment.controlId),
          prompt: context === '' ? prompt : `${prompt} [${context}]`,
          myAnswer: tidy(answers.get(segment.controlId) ?? ''),
          correctAnswer,
          category: '',
          ruleNote: ruleNoteFrom(explanations.get(segment.controlId), correctAnswer),
          subcategory: '',
        },
      });
    }
  }
  return rows;
}

/**
 * Huella de una fila dentro de una actividad.
 *
 * El numero de intento NO entra a proposito: si repito el ejercicio y vuelvo a fallar lo
 * mismo, no quiero la misma entrada dos veces. Si cambio la respuesta, la huella cambia
 * sola porque `myAnswer` forma parte de ella.
 */
export function rowFingerprint(row, activityKey) {
  return fingerprint([activityKey, row.itemRef, row.prompt, row.myAnswer]);
}

/** El bloque que se pega en «Errores para importar». */
export function toJson(rows, session) {
  return JSON.stringify(session ? { session, errors: rows } : rows);
}
