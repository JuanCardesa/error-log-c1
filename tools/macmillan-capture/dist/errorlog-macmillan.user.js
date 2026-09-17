// ==UserScript==
// @name         Error Log C1 — copiar errores de Macmillan
// @namespace    https://github.com/JuanCardesa/error-log
// @version      0.1.0
// @description  Copia solo los fallos de un ejercicio corregido de Macmillan Education Everywhere en el formato que importa el Error Log C1.
// @author       Juan Cardesa
// @match        https://mee.macmillaneducation.com/*
// @match        https://lms-cdn.mee.macmillaneducation.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

// ----- src/core/signals.js -----
/**
 * Descubrimiento de la senal de correccion.
 *
 * No sabemos que clases usa Macmillan para marcar un acierto o un fallo, y no queremos
 * inventarlas. En vez de eso miramos que cambia en el DOM al pulsar corregir y solo
 * aceptamos ese cambio como veredicto si forma una particion binaria coherente sobre
 * todas las respuestas contestadas.
 *
 * Reglas duras:
 * - El color nunca es senal: los nombres de color no estan en el vocabulario y este
 *   modulo no lee estilos calculados en ningun momento.
 * - Comparar mi texto con la solucion nunca es senal: puede haber variantes aceptadas.
 * - Si la particion no es coherente, se falla en cerrado y no se exporta nada.
 */

const INCORRECT_WORDS = [
  'incorrect', 'incorrecta', 'incorrecto', 'wrong', 'fail', 'failed', 'failure',
  'invalid', 'error', 'errors', 'bad', 'ko', 'nok', 'fallo', 'fallado', 'mal',
];

const CORRECT_WORDS = [
  'correct', 'correcta', 'correcto', 'right', 'ok', 'okay', 'pass', 'passed',
  'success', 'successful', 'valid', 'good', 'acierto', 'bien',
];

const NEGATIONS = ['not', 'no', 'non', 'un', 'in'];

/** Atributos cuyo valor puede llevar el veredicto. El nombre por si solo no decide. */
const STATE_ATTR_NAME = /(correct|result|state|status|answer|validation|validity|grade|evaluation|feedback|marking)/;

const TRUTHY = ['true', '1', 'yes', 'y'];
const FALSY = ['false', '0', 'no', 'n'];

/** `answerCorrect` y `answer--correct` deben leerse igual: todo a partes en minusculas. */
function tokenParts(token) {
  return String(token)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part !== '');
}

/**
 * Clasifica un token de clase o un valor de atributo.
 * Devuelve 'correct', 'incorrect' o null. Un nombre de color devuelve null a proposito.
 */
function classifyToken(token) {
  const parts = tokenParts(token);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const previous = i > 0 ? parts[i - 1] : '';
    if (INCORRECT_WORDS.includes(part)) return 'incorrect';
    if (CORRECT_WORDS.includes(part)) {
      // `not-correct` o `un-correct` no son un acierto.
      if (NEGATIONS.includes(previous)) return 'incorrect';
      return 'correct';
    }
  }
  return null;
}

/** Clasifica un par atributo/valor. El nombre acota; el valor decide. */
function classifyAttribute(name, value) {
  const attribute = String(name).toLowerCase();
  const raw = String(value).toLowerCase().trim();
  if (attribute === 'aria-invalid') {
    if (TRUTHY.includes(raw)) return 'incorrect';
    if (FALSY.includes(raw)) return 'correct';
    return null;
  }
  if (!STATE_ATTR_NAME.test(attribute)) return null;
  if (raw === '') return null;
  const nameVerdict = classifyToken(attribute);
  if (TRUTHY.includes(raw)) return nameVerdict;
  if (FALSY.includes(raw)) {
    if (nameVerdict === 'correct') return 'incorrect';
    if (nameVerdict === 'incorrect') return 'correct';
    return null;
  }
  return classifyToken(raw);
}

function added(before, after) {
  const seen = new Set(before);
  return after.filter((value) => !seen.has(value));
}

/** Veredicto unico de una lista de tokens, o null si no hay o si se contradicen. */
function verdictOf(tokens) {
  let verdict = null;
  for (const token of tokens) {
    const found = classifyToken(token);
    if (found === null) continue;
    if (verdict !== null && verdict !== found) return null;
    verdict = found;
  }
  return verdict;
}

function verdictOfAttributes(pairs) {
  let verdict = null;
  for (const pair of pairs) {
    const found = classifyAttribute(pair.name, pair.value);
    if (found === null) continue;
    if (verdict !== null && verdict !== found) return null;
    verdict = found;
  }
  return verdict;
}

/** Candidato por el atributo estandar `aria-invalid`, el mas fiable de los tres. */
function ariaCandidate(controls) {
  const verdicts = new Map();
  for (const control of controls) {
    const before = control.ariaInvalidBefore ?? null;
    const after = control.ariaInvalidAfter ?? null;
    if (after === null || after === before) continue;
    const found = classifyAttribute('aria-invalid', after);
    if (found !== null) verdicts.set(control.id, found);
  }
  return { source: 'aria-invalid', verdicts };
}

/** Candidato por las clases que aparecen al corregir. */
function classCandidate(controls) {
  const verdicts = new Map();
  for (const control of controls) {
    const fresh = added(control.classesBefore ?? [], control.classesAfter ?? []);
    const found = verdictOf(fresh);
    if (found !== null) verdicts.set(control.id, found);
  }
  return { source: 'clases', verdicts };
}

/** Candidato por atributos de estado nuevos o cambiados al corregir. */
function attributeCandidate(controls) {
  const verdicts = new Map();
  for (const control of controls) {
    const before = new Map((control.attrsBefore ?? []).map((pair) => [pair.name, pair.value]));
    const fresh = (control.attrsAfter ?? []).filter((pair) => before.get(pair.name) !== pair.value);
    const found = verdictOfAttributes(fresh);
    if (found !== null) verdicts.set(control.id, found);
  }
  return { source: 'atributos', verdicts };
}

/**
 * Un candidato solo vale si cubre todo lo contestado. Si queda una respuesta mia sin
 * veredicto, el ejercicio esta a medio corregir o el formato no es el que creemos:
 * en los dos casos preferimos no exportar a exportar de menos.
 */
function isCoherent(candidate, controls) {
  if (candidate.verdicts.size === 0) return false;
  for (const control of controls) {
    if (!control.answered) continue;
    if (!candidate.verdicts.has(control.id)) return false;
  }
  return true;
}

function hasAnyChange(controls) {
  return controls.some((control) => {
    if ((control.ariaInvalidBefore ?? null) !== (control.ariaInvalidAfter ?? null)) return true;
    if (added(control.classesBefore ?? [], control.classesAfter ?? []).length > 0) return true;
    const before = new Map((control.attrsBefore ?? []).map((pair) => [pair.name, pair.value]));
    return (control.attrsAfter ?? []).some((pair) => before.get(pair.name) !== pair.value);
  });
}

/**
 * Resuelve el veredicto de cada hueco a partir de la correccion de la plataforma.
 *
 * `empty` no hay controles; `uncorrected` nada ha cambiado todavia; `unsupported` algo
 * cambio pero no es clasificable; `partial` queda una respuesta mia sin veredicto;
 * `conflict` dos senales se contradicen.
 */
function discoverVerdicts(controls) {
  const list = Array.isArray(controls) ? controls : [];
  if (list.length === 0) return { ok: false, reason: 'empty' };
  if (!hasAnyChange(list)) return { ok: false, reason: 'uncorrected' };

  const candidates = [ariaCandidate(list), attributeCandidate(list), classCandidate(list)];
  const classified = candidates.filter((candidate) => candidate.verdicts.size > 0);
  if (classified.length === 0) return { ok: false, reason: 'unsupported' };

  const coherent = classified.filter((candidate) => isCoherent(candidate, list));
  if (coherent.length === 0) return { ok: false, reason: 'partial' };

  const chosen = coherent[0];
  for (const other of coherent.slice(1)) {
    for (const [id, verdict] of other.verdicts) {
      const mine = chosen.verdicts.get(id);
      if (mine !== undefined && mine !== verdict) return { ok: false, reason: 'conflict' };
    }
  }
  return { ok: true, source: chosen.source, verdicts: chosen.verdicts };
}


// ----- src/core/items.js -----
/**
 * Modelo de pregunta y render del enunciado.
 *
 * Una pregunta puede tener varios huecos. Exportamos una entrada por hueco fallado, pero
 * el enunciado se conserva entero y con todos los huecos numerados para que el fallo se
 * entienda sin volver al libro. El hueco concreto se identifica en `itemRef` (`3.2`).
 */

/** Espacios y saltos del HTML colapsados; el contenido no se toca. */
function tidy(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** El hueco vacio del enunciado. Coincide con el que ya usa el error-log. */
const BLANK = '___';

/**
 * Enunciado completo con los huecos visibles.
 * Con un solo hueco queda `They called ___ the meeting.`
 * Con varios, cada uno se numera: `He ___(1) to ___(2) it.`
 */
function renderPrompt(question) {
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
function gapPosition(question, controlId) {
  let index = 0;
  for (const segment of question.segments ?? []) {
    if (segment.type !== 'gap') continue;
    index += 1;
    if (segment.controlId === controlId) return index;
  }
  return 0;
}

/** Cuenta de huecos de la pregunta. */
function gapCount(question) {
  return (question.segments ?? []).filter((segment) => segment.type === 'gap').length;
}

/**
 * Referencia del item. Con varios huecos se sufija con el numero de hueco para que dos
 * fallos de la misma pregunta no se confundan ni se dedupliquen entre si.
 */
function itemRefFor(question, controlId) {
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
function contextOf(question) {
  const pieces = [tidy(question.instructions ?? ''), tidy(question.context ?? '')];
  return pieces.filter((piece) => piece !== '').join(' — ');
}

/** Recuento para la cabecera de la sesion. Nunca entra en el listado de errores. */
function summarize(controls, verdicts) {
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


// ----- src/core/exportable.js -----
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


/** Igual que MAX_IMPORT_ROWS en src/lib/import/errors.ts. Lo fija una prueba. */
const MAX_BATCH_ROWS = 100;

/** Hash estable y corto para el control de duplicados. FNV-1a, sin dependencias. */
function fingerprint(parts) {
  const text = parts.join(' ');
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
function toImportEntries(capture) {
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
function rowFingerprint(row, activityKey) {
  return fingerprint([activityKey, row.itemRef, row.prompt, row.myAnswer]);
}

/** El bloque que se pega en «Errores para importar». */
function toJson(rows) {
  return JSON.stringify(rows, null, 2);
}


// ----- src/core/tray.js -----
/**
 * Bandeja de fallos.
 *
 * El coste de registrar un error no esta en copiarlo, esta en rellenar respuesta
 * correcta, categoria y regla, que son obligatorias en el error-log. Por eso el guion
 * no exporta ejercicio a ejercicio: va guardando los fallos de toda la sesion de estudio
 * y los entrega juntos, para revisarlos de una sentada.
 *
 * Reglas:
 * - Nada entra dos veces: cada fallo lleva su huella de actividad e intento.
 * - Lo que ya se copio, o lo que tire a la basura a proposito, no vuelve a entrar.
 * - La bandeja sobrevive a cambiar de ejercicio y a recargar.
 */

const MAX_TRAY = 300;

/**
 * Completa una fila ya guardada con lo que se sepa despues.
 *
 * El fallo entra en la bandeja en cuanto se corrige, pero la solucion puede aparecer mas
 * tarde, al pulsar «mostrar respuestas». Sin esto, la fila se quedaria congelada sin ella.
 * Solo se rellenan huecos: nunca se pisa un dato que ya estuviera.
 */
function enrich(stored, incoming) {
  const merged = { ...stored };
  let changed = false;
  for (const field of ['correctAnswer', 'ruleNote']) {
    const had = String(stored[field] ?? '');
    const gets = String(incoming[field] ?? '');
    if (had === '' && gets !== '') {
      merged[field] = gets;
      changed = true;
    }
  }
  return { merged, changed };
}

/**
 * Anade los fallos que aun no estuvieran ni en la bandeja ni ya despachados, y completa
 * los que ya estaban si ahora se sabe algo mas de ellos.
 * @returns {{tray: Array, added: number, updated: number, full: boolean}}
 */
function addToTray(tray, done, entries) {
  const next = [...tray];
  const position = new Map(next.map((entry, index) => [entry.mark, index]));
  let added = 0;
  let updated = 0;
  let full = false;

  for (const entry of entries) {
    const at = position.get(entry.mark);
    if (at !== undefined) {
      const { merged, changed } = enrich(next[at].row, entry.row);
      if (changed) {
        next[at] = { ...next[at], row: merged };
        updated += 1;
      }
      continue;
    }
    if (done.has(entry.mark)) continue;
    if (next.length >= MAX_TRAY) {
      full = true;
      break;
    }
    position.set(entry.mark, next.length);
    next.push(entry);
    added += 1;
  }
  return { tray: next, added, updated, full };
}

/**
 * Completa la solucion de los fallos guardados con lo que la plataforma confirma.
 *
 * Si fallo un hueco, reintento y esta vez lo acierto, Macmillan marca ese mismo hueco
 * como correcto con el valor bueno dentro. Eso no es una deduccion nuestra: es su
 * veredicto. Con el identificador del hueco reconocemos el fallo que ya teniamos
 * guardado y le ponemos la solucion.
 *
 * Nunca se pisa una solucion que ya estuviera, y si el valor confirmado coincide con mi
 * respuesta fallada se ignora: seria una contradiccion de la plataforma, no un dato.
 *
 * @param {Map<string, string>} confirmed huecos ahora correctos y su valor
 */
function confirmAnswers(tray, activityKey, confirmed) {
  let updated = 0;
  const next = tray.map((entry) => {
    if (entry.activityKey !== activityKey) return entry;
    if (String(entry.row.correctAnswer ?? '') !== '') return entry;
    const value = confirmed.get(entry.gapId);
    if (value === undefined || value === '' || value === entry.row.myAnswer) return entry;
    updated += 1;
    return { ...entry, row: { ...entry.row, correctAnswer: value } };
  });
  return { tray: updated > 0 ? next : tray, updated };
}

/** Cuantos fallos hay y de cuantas actividades distintas. */
function trayStats(tray) {
  return {
    count: tray.length,
    activities: new Set(tray.map((entry) => entry.activityKey)).size,
  };
}

/** Saca la primera tanda y devuelve el resto, para respetar el limite del importador. */
function takeBatch(tray, size) {
  return { batch: tray.slice(0, size), rest: tray.slice(size) };
}

/** Marca como despachadas las huellas dadas, sin duplicar. */
function markDone(done, marks) {
  const next = new Set(done);
  for (const mark of marks) next.add(mark);
  return next;
}

/** Texto de la linea de la bandeja en el panel. */
function describeTray(tray) {
  const { count, activities } = trayStats(tray);
  if (count === 0) return 'La bandeja esta vacia. Haz ejercicios y se iran guardando solos.';
  const fallos = count === 1 ? '1 fallo guardado' : `${String(count)} fallos guardados`;
  const de = activities === 1 ? '1 actividad' : `${String(activities)} actividades`;
  return `Bandeja: ${fallos} de ${de}.`;
}


// ----- src/core/report.js -----
/**
 * Mensajes de estado.
 *
 * La distincion que importa: «no hay errores» es un exito y no genera entradas;
 * «no he podido leer el ejercicio» es un fallo de lectura y tampoco genera entradas,
 * pero se dice de otra manera para que no parezca lo mismo.
 */

const UNSUPPORTED = {
  tone: 'problem',
  title: 'No reconozco como marca la correccion este ejercicio',
  detail: 'Algo ha cambiado al corregir, pero no hay ninguna senal que diga que hueco esta bien y cual mal. Este formato todavia no esta soportado. Usa «Copiar muestra tecnica» y pasamela para escribir el adaptador.',
  canExport: false,
};

const MESSAGES = {
  idle: {
    tone: 'info',
    title: 'Esperando a que corrijas',
    detail: 'Haz el ejercicio y pulsa el boton de corregir de Macmillan. Este panel se activa solo.',
    canExport: false,
  },
  empty: {
    tone: 'problem',
    title: 'No veo preguntas en esta pantalla',
    detail: 'Abre el ejercicio y espera a que cargue del todo. Si ya esta abierto, este formato no esta soportado.',
    canExport: false,
  },
  uncorrected: {
    tone: 'info',
    title: 'El ejercicio no esta corregido',
    detail: 'No exporto nada todavia. Pulsa el boton de corregir de Macmillan y vuelve aqui.',
    canExport: false,
  },
  unsupported: UNSUPPORTED,
  conflict: {
    tone: 'problem',
    title: 'Dos senales de correccion se contradicen',
    detail: 'No me fio del resultado, asi que no exporto nada. Usa «Copiar muestra tecnica» y pasamela.',
    canExport: false,
  },
  partial: {
    tone: 'problem',
    title: 'El ejercicio esta a medio corregir',
    detail: 'Hay respuestas mias sin veredicto: o faltan preguntas por cargar o el formato no es el que creo. No exporto nada para no dejarme fallos fuera.',
    canExport: false,
  },
  unreadable: {
    tone: 'problem',
    title: 'Hay formatos que todavia no se leer',
    detail: 'Este ejercicio usa interacciones que aun no estan soportadas (arrastrar y soltar, emparejar sobre imagen). No exporto nada para no darte un resultado incompleto.',
    canExport: false,
  },
};

/**
 * @param {{phase: string, incorrect?: number, correct?: number, checked?: number, fresh?: number, skipped?: number}} state
 */
function describe(state) {
  if (state.phase !== 'ready') return MESSAGES[state.phase] ?? UNSUPPORTED;

  const incorrect = state.incorrect ?? 0;
  const checked = state.checked ?? 0;
  if (incorrect === 0) {
    return {
      tone: 'good',
      title: 'Todo correcto: no hay errores que registrar',
      detail: `He comprobado ${String(checked)} ${checked === 1 ? 'respuesta' : 'respuestas'} y no has fallado ninguna. No genero ninguna entrada.`,
      canExport: false,
    };
  }

  const fresh = state.fresh ?? incorrect;
  if (fresh === 0) {
    return {
      tone: 'good',
      title: 'Los fallos de esta actividad ya estaban guardados',
      detail: `Los ${String(incorrect)} de este intento ya estan en la bandeja o ya los copiaste. No los repito.`,
      canExport: false,
    };
  }

  return {
    tone: 'good',
    title: `${String(fresh)} ${fresh === 1 ? 'fallo guardado' : 'fallos guardados'} de esta actividad`,
    detail: `De ${String(checked)} respuestas comprobadas. Sigue con los siguientes ejercicios y pulsa «Copiar todo» al acabar.`,
    canExport: true,
  };
}


// ----- src/dom/answers.js -----
/**
 * Custodia de mi respuesta original.
 *
 * Algunos ejercicios sobrescriben el hueco con la solucion al pulsar «mostrar
 * respuestas». Para no perderla, guardamos el valor cada vez que lo escribo yo y solo
 * entonces: los eventos que dispara la propia plataforma llegan con `isTrusted` a false
 * o no llegan, asi que una sobrescritura programada nunca pisa lo que yo tecleé.
 *
 * Efecto secundario util: si despues de corregir el valor del hueco cambia sin que yo
 * toque nada, ese valor nuevo es la solucion que revela la plataforma.
 */

/** Lee el valor visible de un control logico. */
function readValue(control) {
  const [first] = control.elements;
  if (!first) return '';
  if (control.kind === 'choice') {
    return control.elements
      .filter((element) => element.checked)
      .map((element) => labelOf(element))
      .join(' | ');
  }
  if (control.kind === 'select') {
    const option = first.selectedOptions?.[0];
    return option ? String(option.textContent ?? '') : String(first.value ?? '');
  }
  if (control.kind === 'contenteditable') return String(first.textContent ?? '');
  return String(first.value ?? '');
}

/** Texto de la opcion marcada: la etiqueta asociada, o el propio valor. */
function labelOf(element) {
  const byId = element.id ? element.ownerDocument?.querySelector(`label[for="${cssEscape(element.id)}"]`) : null;
  const wrapper = element.closest ? element.closest('label') : null;
  const text = byId?.textContent ?? wrapper?.textContent ?? element.value ?? '';
  return String(text).replace(/\s+/g, ' ').trim();
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/["\\]/g, '');
}

class AnswerStore {
  constructor() {
    /** Ultimo valor que escribi yo, por control. */
    this.mine = new Map();
    /** Valor en el instante de corregir, para detectar la revelacion posterior. */
    this.atCheck = new Map();
    /** Solucion revelada por la plataforma despues de corregir. */
    this.revealed = new Map();
    /** Huecos que he vuelto a tocar yo despues de corregir. */
    this.touched = new Set();
    this.frozen = false;
  }

  /**
   * Solo se llama desde eventos de usuario reales. Si ya hemos corregido, mi respuesta
   * no se pisa, pero se anota que he vuelto a escribir en ese hueco: a partir de ahi su
   * valor es mio otra vez y no puede confundirse con una solucion revelada.
   */
  remember(controlId, value) {
    if (this.frozen) {
      this.touched.add(controlId);
      return;
    }
    this.mine.set(controlId, value);
  }

  /** Congela mis respuestas en el momento de la correccion. */
  freeze(controls) {
    for (const control of controls) {
      const current = readValue(control);
      this.atCheck.set(control.id, current);
      if (!this.mine.has(control.id) && current !== '') this.mine.set(control.id, current);
    }
    this.frozen = true;
  }

  /**
   * Tras corregir, un cambio de valor que yo no he hecho es la solucion revelada.
   * Mi respuesta no se toca nunca a partir de aqui.
   */
  observeReveal(control) {
    if (!this.frozen) return;
    if (this.touched.has(control.id)) return;
    const current = readValue(control);
    const before = this.atCheck.get(control.id) ?? '';
    if (current !== '' && current !== before) this.revealed.set(control.id, current);
  }

  answerOf(controlId) {
    return this.mine.get(controlId) ?? this.atCheck.get(controlId) ?? '';
  }

  solutionOf(controlId) {
    return this.revealed.get(controlId) ?? '';
  }

  answers() {
    const map = new Map();
    for (const id of new Set([...this.mine.keys(), ...this.atCheck.keys()])) map.set(id, this.answerOf(id));
    return map;
  }

  reset() {
    this.mine.clear();
    this.atCheck.clear();
    this.revealed.clear();
    this.touched.clear();
    this.frozen = false;
  }
}

/** Engancha los eventos de usuario. Devuelve la funcion para soltarlos. */
function trackUserInput(root, store, controlIdAt) {
  const handler = (event) => {
    if (!event.isTrusted) return;
    const id = controlIdAt(event.target);
    if (id === null) return;
    store.remember(id.controlId, readValue(id.control));
  };
  const events = ['input', 'change', 'blur'];
  for (const name of events) root.addEventListener(name, handler, true);
  return () => {
    for (const name of events) root.removeEventListener(name, handler, true);
  };
}


// ----- src/dom/macmillan.js -----
/**
 * Adaptador del reproductor RCF de Macmillan.
 *
 * Escrito a partir del DOM real de una actividad corregida del libro «Ready for C1
 * Advanced», no de suposiciones. La capa de marcado que pone la plataforma es:
 *
 *   <li value="5">
 *     <p>stand a<br>jump at the<br>
 *       <span data-rcfid="CAPE_ID_15" data-rcfinteraction="complexDroppable">
 *         <span class="markable dev-markable-container incorrectAnswer" aria-invalid="true">
 *           <span class="dragTarget ... populated" title="drag and drop gap 5, challenge, Incorrect">challenge</span>
 *           <span class="mark wrong" aria-label="Incorrect"><span class="visually-hidden">incorrect</span></span>
 *         </span>
 *       </span>
 *     </p>
 *   </li>
 *
 * Dos señales independientes y coincidentes por hueco: `aria-invalid` y la clase
 * `correctAnswer` / `incorrectAnswer`. Si alguna vez se contradicen, no exportamos.
 */


/** Raiz de una actividad. `data-rcfxmlid` la identifica de forma estable. */
const ACTIVITY_SELECTOR = '.dev-rcf-content.activity[data-rcfxmlid], .activity[data-rcfxmlid]';

/** Envoltorio que la plataforma marca al corregir cada hueco. */
const MARKABLE_SELECTOR = '.markable, .dev-markable-container';

/** Ruido que no debe entrar ni en el enunciado ni en mi respuesta. */
const NOISE_SELECTOR = '.mark, .visually-hidden, .globalAriaLive, script, style';

/** Interacciones comprobadas contra Macmillan de verdad. */
const VERIFIED_INTERACTIONS = ['rcfDroppable'];

function findActivity(doc) {
  return doc.querySelector(ACTIVITY_SELECTOR);
}

/** La plataforma añade `marked` a la actividad cuando la ha corregido. */
function isMarked(activity) {
  return activity.classList.contains('marked');
}

function textOf(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  for (const noise of clone.querySelectorAll(NOISE_SELECTOR)) noise.remove();
  return tidy(clone.textContent ?? '');
}

/**
 * Veredicto de un hueco a partir de las dos señales de la plataforma.
 * `null` = sin corregir. `'conflict'` = las dos señales no dicen lo mismo.
 */
function verdictOfMarkable(markable) {
  const aria = markable.getAttribute('aria-invalid');
  const byAria = aria === 'true' ? 'incorrect' : aria === 'false' ? 'correct' : null;
  const classes = markable.getAttribute('class') ?? '';
  const byClass = /\bincorrectAnswer\b/.test(classes)
    ? 'incorrect'
    : /\bcorrectAnswer\b/.test(classes) ? 'correct' : null;

  if (byAria !== null && byClass !== null && byAria !== byClass) return 'conflict';
  return byAria ?? byClass;
}

/** Identificador estable del hueco; lo pone la propia plataforma. */
function gapIdOf(markable, fallback) {
  const holder = markable.closest('[data-rcfid]');
  const id = holder?.getAttribute('data-rcfid') ?? '';
  return id !== '' ? id : `gap-${String(fallback)}`;
}

/** Mi respuesta: lo que hay dentro del hueco, sin la marca de correccion. */
function answerOfMarkable(markable) {
  const target = markable.querySelector('.dragTarget, .dev-droppable, input, textarea, select');
  if (target) {
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return tidy(target.value ?? '');
    if (tag === 'select') return tidy(target.selectedOptions?.[0]?.textContent ?? target.value ?? '');
  }
  return textOf(target ?? markable);
}

/**
 * Respuestas actuales de todos los huecos, este la actividad corregida o no.
 * Sirve para quedarnos con lo que he escrito yo ANTES de que la plataforma corrija.
 */
function readAnswers(activity) {
  const answers = new Map();
  [...activity.querySelectorAll(MARKABLE_SELECTOR)].forEach((markable, index) => {
    answers.set(gapIdOf(markable, index), answerOfMarkable(markable));
  });
  return answers;
}

/** El contenedor del item. `li[value]` da el numero de pregunta tal cual lo ve el libro. */
function itemOf(markable, activity) {
  const numbered = markable.closest('li[value]');
  if (numbered) return { container: numbered, ref: numbered.getAttribute('value') ?? '' };
  const item = markable.closest('li, p, tr, .item');
  return { container: item ?? activity, ref: '' };
}

function promptSegmentsOf(container, idFor) {
  const segments = [];
  const push = (text) => {
    if (text === '') return;
    const last = segments[segments.length - 1];
    if (last && last.type === 'text') last.text += text;
    else segments.push({ type: 'text', text });
  };
  const walk = (node) => {
    if (node.nodeType === 3) {
      push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.matches(NOISE_SELECTOR)) return;
    if (node.tagName.toLowerCase() === 'br') {
      push(' / ');
      return;
    }
    if (node.matches(MARKABLE_SELECTOR)) {
      segments.push({ type: 'gap', controlId: idFor(node) });
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(container);
  return segments;
}

const MAX_CONTEXT = 320;

/** Instrucciones, texto de referencia y banco de palabras, si los hay. */
function activityContextOf(activity) {
  const rubric = textOf(activity.querySelector('.rubricBody, .rubric'));
  const reference = textOf(activity.querySelector('.referenceContentBlock, .mm_presentation .mm_blockText'));
  const pool = [...activity.querySelectorAll('.wordBox .dragItem, .wordBox li')]
    .map((item) => tidy(item.getAttribute('aria-label') ?? item.textContent ?? ''))
    .filter((word) => word !== '');
  const parts = [];
  if (rubric !== '') parts.push(rubric);
  if (reference !== '') parts.push(reference);
  if (pool.length > 0) parts.push(`Opciones: ${[...new Set(pool)].join(', ')}`);
  const joined = parts.join(' ');
  return joined.length > MAX_CONTEXT ? `${joined.slice(0, MAX_CONTEXT)}…` : joined;
}

/** Puntuacion que muestra la plataforma. Va a la cabecera de la sesion, no a los errores. */
function scoreOf(doc) {
  return tidy(doc.querySelector('[data-player-control=score-card-text]')?.textContent ?? '');
}

/**
 * Lee una actividad corregida.
 *
 * @returns {{ok: true, activityKey: string, interactions: string[], verified: boolean,
 *            questions: Array, verdicts: Map, answers: Map, counts: object}
 *          | {ok: false, reason: string}}
 */
function readActivity(activity, doc) {
  if (!isMarked(activity)) return { ok: false, reason: 'uncorrected' };

  const markables = [...activity.querySelectorAll(MARKABLE_SELECTOR)];
  if (markables.length === 0) return { ok: false, reason: 'empty' };

  const verdicts = new Map();
  const answers = new Map();
  const byContainer = new Map();
  let answeredWithoutVerdict = 0;

  markables.forEach((markable, index) => {
    const id = gapIdOf(markable, index);
    const verdict = verdictOfMarkable(markable);
    const answer = answerOfMarkable(markable);
    answers.set(id, answer);

    if (verdict === 'conflict') {
      verdicts.set(id, 'conflict');
      return;
    }
    if (verdict === null) {
      if (answer !== '') answeredWithoutVerdict += 1;
      return;
    }
    verdicts.set(id, verdict);

    const { container, ref } = itemOf(markable, activity);
    if (!byContainer.has(container)) byContainer.set(container, ref);
  });

  if ([...verdicts.values()].includes('conflict')) return { ok: false, reason: 'conflict' };
  if (verdicts.size === 0) return { ok: false, reason: 'uncorrected' };
  // Una respuesta mia sin veredicto significa que no lo he leido todo: no exportamos.
  if (answeredWithoutVerdict > 0) return { ok: false, reason: 'partial' };

  const context = activityContextOf(activity);
  const idFor = (markable) => gapIdOf(markable, markables.indexOf(markable));
  const questions = [...byContainer.entries()].map(([container, ref]) => ({
    itemRef: ref,
    instructions: '',
    context,
    container,
    segments: promptSegmentsOf(container, idFor),
  }));

  const interactions = (activity.getAttribute('data-interactions') ?? '')
    .split(/\s+/)
    .filter((name) => name !== '');

  let correct = 0;
  let incorrect = 0;
  for (const verdict of verdicts.values()) {
    if (verdict === 'correct') correct += 1;
    else incorrect += 1;
  }

  return {
    ok: true,
    activityKey: activity.getAttribute('data-rcfxmlid') ?? activity.id ?? '',
    interactions,
    verified: interactions.length > 0 && interactions.every((name) => VERIFIED_INTERACTIONS.includes(name)),
    questions,
    verdicts,
    answers,
    counts: { checked: correct + incorrect, correct, incorrect, pending: 0 },
    score: scoreOf(doc ?? activity.ownerDocument),
  };
}


// ----- src/dom/collect.js -----
/**
 * Lectura del ejercicio: que controles hay, como se agrupan en preguntas y que estado
 * lleva cada uno. Aqui no se decide nada sobre aciertos ni fallos; solo se observa.
 */


/** Marca de nuestra propia interfaz, para no leernos a nosotros mismos. */
const UI_ATTR = 'data-errorlog-ui';

const TEXT_INPUT_TYPES = ['text', 'search', 'email', 'number', 'tel', 'url', ''];

/** Cuantos niveles subimos buscando donde marca la plataforma la correccion. */
const STATE_LEVELS = 4;

function isVisible(element) {
  if (element.hidden) return false;
  if (element.getAttribute('type') === 'hidden') return false;
  return true;
}

function usable(element) {
  return isVisible(element) && !element.closest(`[${UI_ATTR}]`);
}

/**
 * Controles logicos del ejercicio. Un grupo de radios o casillas con el mismo nombre
 * cuenta como un unico hueco, que es como se responde y como se corrige.
 */
function findControls(root) {
  const controls = [];
  const byElement = new Map();
  const groups = new Map();
  let serial = 0;

  const nodes = root.querySelectorAll('input, textarea, select, [contenteditable]');
  for (const element of nodes) {
    if (!usable(element)) continue;
    if (element.disabled) continue;
    const tag = element.tagName.toLowerCase();
    let kind = null;
    if (tag === 'select') kind = 'select';
    else if (tag === 'textarea') kind = 'text';
    else if (tag === 'input') {
      const type = String(element.getAttribute('type') ?? '').toLowerCase();
      if (type === 'radio' || type === 'checkbox') kind = 'choice';
      else if (TEXT_INPUT_TYPES.includes(type)) kind = 'text';
    } else {
      const editable = element.getAttribute('contenteditable');
      if (editable === '' || editable === 'true') kind = 'contenteditable';
    }
    if (kind === null) continue;
    if (kind === 'text' && element.readOnly) continue;

    if (kind === 'choice') {
      const key = element.name !== '' ? `name:${element.name}` : `group:${String(serial)}`;
      let control = groups.get(key);
      if (!control) {
        serial += 1;
        control = { id: `c${String(serial)}`, kind, elements: [] };
        groups.set(key, control);
        controls.push(control);
      }
      control.elements.push(element);
      byElement.set(element, control);
      continue;
    }

    serial += 1;
    const control = { id: `c${String(serial)}`, kind, elements: [element] };
    controls.push(control);
    byElement.set(element, control);
  }
  return { controls, byElement };
}

function classesOf(element) {
  return String(element.getAttribute('class') ?? '').split(/\s+/).filter((token) => token !== '');
}

function attrsOf(element) {
  const pairs = [];
  for (const attribute of element.attributes) {
    if (attribute.name === 'class' || attribute.name === 'style') continue;
    pairs.push({ name: attribute.name, value: attribute.value });
  }
  return pairs;
}

/**
 * La marca de correccion no siempre cae en el input: muchas veces esta en un envoltorio.
 * Subimos hasta encontrar el nivel MAS INTERNO que dice algo, para que dos huecos de la
 * misma pregunta no acaben heredando el veredicto del bloque que los contiene.
 */
function snapshotState(control) {
  const [first] = control.elements;
  if (!first) return { classes: [], attrs: [], aria: null };

  const union = { classes: [], attrs: [], aria: null };
  let node = first;
  for (let depth = 0; depth < STATE_LEVELS && node; depth += 1) {
    const classes = classesOf(node);
    const attrs = attrsOf(node);
    const aria = node.getAttribute('aria-invalid');
    const speaks = classes.some((token) => classifyToken(token) !== null) || aria !== null;
    if (speaks) return { classes, attrs, aria };
    union.classes.push(...classes);
    union.attrs.push(...attrs.map((pair) => ({ name: `${String(depth)}:${pair.name}`, value: pair.value })));
    node = node.parentElement;
  }
  // Ningun nivel dice nada. Devolvemos la union para poder distinguir «no has corregido
  // todavia» de «ha cambiado algo que no se leer», que no son el mismo problema.
  return union;
}

/** Une el estado previo y el actual en lo que espera `discoverVerdicts`. */
function toSignalInput(control, before, after, answered) {
  return {
    id: control.id,
    answered,
    classesBefore: before?.classes ?? [],
    classesAfter: after.classes,
    attrsBefore: before?.attrs ?? [],
    attrsAfter: after.attrs,
    ariaInvalidBefore: before?.aria ?? null,
    ariaInvalidAfter: after.aria,
  };
}

const QUESTION_HINT = /(question|item|exercise|activity|task|pregunta|ejercicio|actividad)/i;

function questionContainerOf(element, root) {
  let node = element.parentElement;
  let listItem = null;
  while (node && node !== root) {
    const marker = `${String(node.getAttribute('class') ?? '')} ${node.id} ${[...node.attributes].map((a) => a.name).join(' ')}`;
    if (QUESTION_HINT.test(marker)) return node;
    if (listItem === null && node.tagName.toLowerCase() === 'li') listItem = node;
    node = node.parentElement;
  }
  return listItem ?? element.parentElement ?? root;
}

const LEADING_NUMBER = /^\s*(\d+)\s*[.)\]]?\s/;

function itemRefOf(container) {
  for (const child of container.querySelectorAll('*')) {
    const text = tidy(child.textContent ?? '');
    if (/^\d{1,3}[.)]?$/.test(text) && child.children.length === 0) {
      return { ref: text.replace(/[.)]$/, ''), skip: child };
    }
  }
  const match = LEADING_NUMBER.exec(tidy(container.textContent ?? ''));
  return { ref: match ? match[1] : '', skip: null };
}

function segmentsOf(container, byElement, skip) {
  const segments = [];
  const emitted = new Set();
  const pushText = (text) => {
    if (tidy(text) === '') return;
    const last = segments[segments.length - 1];
    if (last && last.type === 'text') last.text += text;
    else segments.push({ type: 'text', text });
  };
  const walk = (node) => {
    if (node === skip) return;
    if (node.nodeType === 3) {
      pushText(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.hasAttribute(UI_ATTR)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'button') return;
    const control = byElement.get(node);
    if (control) {
      if (!emitted.has(control.id)) {
        emitted.add(control.id);
        segments.push({ type: 'gap', controlId: control.id });
      }
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(container);
  return segments;
}

const INSTRUCTION_HINT = '[class*=instruction], [class*=rubric], [class*=enunciado], [data-instruction]';

function instructionsOf(root) {
  const node = root.querySelector(INSTRUCTION_HINT);
  const text = tidy(node?.textContent ?? '');
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/** Agrupa los controles en preguntas y construye los segmentos del enunciado. */
function buildQuestions(root, controls, byElement) {
  const containers = new Map();
  for (const control of controls) {
    const [first] = control.elements;
    if (!first) continue;
    const container = questionContainerOf(first, root);
    if (!containers.has(container)) containers.set(container, []);
    containers.get(container).push(control);
  }

  const instructions = instructionsOf(root);
  const questions = [];
  for (const [container, members] of containers) {
    const { ref, skip } = itemRefOf(container);
    questions.push({
      itemKey: fingerprint([ref, tidy(container.textContent ?? '').slice(0, 160)]),
      itemRef: ref,
      container,
      instructions,
      context: '',
      segments: segmentsOf(container, byElement, skip),
      controls: members,
    });
  }
  return questions;
}

const UNSUPPORTED_SELECTOR = '[draggable="true"], [role="application"], canvas, [class*="drag"], [class*="drop-zone"]';

/** Interacciones que todavia no se leer. Se avisa; no se adivina. */
function detectUnsupported(root) {
  const found = [...root.querySelectorAll(UNSUPPORTED_SELECTOR)].filter((element) => usable(element));
  return found.length;
}

/** Identidad de la actividad, para no mezclar ejercicios distintos. */
function activityKeyOf(doc, root) {
  const href = doc.defaultView?.location?.href ?? '';
  let path = href;
  let ids = '';
  try {
    const url = new URL(href);
    path = url.pathname;
    ids = [...url.searchParams.entries()]
      .filter(([key]) => /(id|content|activity|unit|lesson|page|exercise)/i.test(key))
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('&');
  } catch {
    path = href;
  }
  const heading = tidy(root.querySelector('h1, h2, h3')?.textContent ?? '');
  return {
    key: fingerprint([path, ids, tidy(doc.title ?? ''), heading]),
    label: heading !== '' ? heading : tidy(doc.title ?? '') || path,
  };
}


// ----- src/dom/sample.js -----
/**
 * Muestra tecnica minima.
 *
 * Sirve para escribir un adaptador cuando un formato no esta soportado. Lleva solo la
 * estructura de UNA pregunta y el estado de sus controles. No lleva cookies, ni tokens,
 * ni cabeceras, ni la query de la URL, ni nada de la cuenta.
 */


const MAX_HTML = 6000;

function safeLocation(doc) {
  try {
    const url = new URL(doc.defaultView?.location?.href ?? '');
    return `${url.origin}${url.pathname}`;
  } catch {
    return '(desconocida)';
  }
}

function stateOf(element) {
  const attrs = [];
  for (const attribute of element.attributes) {
    if (attribute.name === 'style') continue;
    attrs.push(`${attribute.name}="${attribute.value}"`);
  }
  return attrs.join(' ');
}

function ancestry(element, levels = 4) {
  const chain = [];
  let node = element;
  for (let depth = 0; depth < levels && node; depth += 1) {
    chain.push(`${node.tagName.toLowerCase()} ${stateOf(node)}`.trim());
    node = node.parentElement;
  }
  return chain;
}

function cleanHtml(container) {
  const clone = container.cloneNode(true);
  for (const ours of clone.querySelectorAll(`[${UI_ATTR}]`)) ours.remove();
  for (const node of clone.querySelectorAll('script, style')) node.remove();
  const html = clone.outerHTML ?? '';
  return html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}\n<!-- recortado -->` : html;
}

/**
 * @param {{doc: Document, question: object|null, controls: Array, store: object, note: string}} input
 */
function buildSample(input) {
  const { doc, question, controls, store, note } = input;
  const container = question?.container ?? null;
  const lines = [
    '# Muestra tecnica para el adaptador de Macmillan',
    '',
    `Pagina: ${safeLocation(doc)}`,
    `Marco: ${doc.defaultView === doc.defaultView?.top ? 'documento principal' : 'iframe del reproductor'}`,
    `Estado: ${note}`,
    `Controles detectados: ${String(controls.length)}`,
    '',
    '## Estado de cada control',
  ];

  for (const control of controls.slice(0, 12)) {
    lines.push('');
    lines.push(`### ${control.id} (${control.kind})`);
    lines.push(`valor visible ahora: ${JSON.stringify(readValue(control))}`);
    lines.push(`mi respuesta guardada: ${JSON.stringify(store.answerOf(control.id))}`);
    const [first] = control.elements;
    if (first) {
      lines.push('cadena de ancestros, del control hacia fuera:');
      for (const step of ancestry(first)) lines.push(`  - ${step}`);
    }
  }

  lines.push('');
  lines.push('## HTML de una pregunta corregida');
  lines.push('');
  lines.push('```html');
  lines.push(container ? cleanHtml(container) : '(no he podido aislar el contenedor de la pregunta)');
  lines.push('```');

  if (question) {
    lines.push('');
    lines.push(`Enunciado leido: ${JSON.stringify(tidy(question.segments?.map((s) => (s.type === 'gap' ? '___' : s.text)).join('') ?? ''))}`);
  }

  return lines.join('\n');
}


// ----- src/dom/ui.js -----
/**
 * Panel flotante dentro del marco del ejercicio.
 *
 * Vive en un shadow root para que ni la hoja de estilos de Macmillan nos afecte ni
 * nosotros afectemos a la suya, y va marcado con `data-errorlog-ui` para que el lector
 * del ejercicio se salte nuestra propia interfaz.
 */


const STYLE = `
:host { all: initial; }
.box {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 320px; max-width: calc(100vw - 32px); max-height: 70vh; overflow: auto;
  font: 13px/1.45 system-ui, -apple-system, Segoe UI, sans-serif;
  background: #fff; color: #1b1b1b; border: 1px solid #c8c8c8; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 12px;
}
.box[hidden] { display: none; }
h1 { font-size: 13px; margin: 0 0 6px; display: flex; justify-content: space-between; gap: 8px; }
h1 span { font-weight: 600; }
.status { margin: 0 0 4px; font-weight: 600; }
.detail { margin: 0 0 10px; color: #444; }
.good .status { color: #14622f; }
.problem .status { color: #8a1c1c; }
.info .status { color: #1b4b8a; }
.counts { margin: 0 0 6px; padding: 6px 8px; background: #f3f5f8; border-radius: 6px; color: #333; }
.tray { margin: 0 0 10px; padding: 6px 8px; background: #eef4ec; border-radius: 6px; color: #23502f; font-weight: 600; }
.counts b { font-weight: 600; }
button {
  font: inherit; padding: 7px 10px; margin: 0 6px 6px 0; cursor: pointer;
  border: 1px solid #b6b6b6; border-radius: 6px; background: #f6f6f6;
}
button.primary { background: #1b4b8a; border-color: #1b4b8a; color: #fff; }
button:disabled { opacity: .5; cursor: default; }
textarea { width: 100%; min-height: 90px; font: 11px/1.4 ui-monospace, monospace; margin-top: 6px; }
.toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  font: 13px system-ui, sans-serif; padding: 8px 12px; border-radius: 999px;
  border: 1px solid #1b4b8a; background: #1b4b8a; color: #fff; cursor: pointer;
}
.note { color: #666; margin: 8px 0 0; }
`;

function element(doc, tag, props = {}) {
  const node = doc.createElement(tag);
  Object.assign(node, props);
  return node;
}

class Panel {
  constructor(doc, handlers) {
    this.doc = doc;
    this.handlers = handlers;
    this.host = element(doc, 'div');
    this.host.setAttribute(UI_ATTR, '');
    this.root = this.host.attachShadow({ mode: 'open' });

    const style = element(doc, 'style', { textContent: STYLE });
    this.toggle = element(doc, 'button', { className: 'toggle', textContent: 'Errores' });
    this.box = element(doc, 'div', { className: 'box info' });
    this.box.hidden = true;

    const heading = element(doc, 'h1');
    heading.append(element(doc, 'span', { textContent: 'Error Log C1' }));
    this.close = element(doc, 'button', { textContent: 'Cerrar' });
    heading.append(this.close);

    this.status = element(doc, 'p', { className: 'status' });
    this.detail = element(doc, 'p', { className: 'detail' });
    this.counts = element(doc, 'p', { className: 'counts' });
    this.tray = element(doc, 'p', { className: 'tray' });
    this.copy = element(doc, 'button', { className: 'primary', textContent: 'Copiar todo' });
    this.empty = element(doc, 'button', { textContent: 'Vaciar la bandeja' });
    this.sample = element(doc, 'button', { textContent: 'Copiar muestra tecnica' });
    this.forget = element(doc, 'button', { textContent: 'Olvidar lo exportado' });
    this.area = element(doc, 'textarea');
    this.area.hidden = true;
    this.area.setAttribute('aria-label', 'Bloque para copiar');
    this.note = element(doc, 'p', { className: 'note' });

    this.box.append(heading, this.status, this.detail, this.counts, this.tray, this.copy, this.empty, this.sample, this.forget, this.area, this.note);
    this.root.append(style, this.toggle, this.box);

    this.toggle.addEventListener('click', () => { this.open(); });
    this.close.addEventListener('click', () => { this.shut(); });
    this.copy.addEventListener('click', () => { this.handlers.onCopy(); });
    this.empty.addEventListener('click', () => { this.handlers.onEmpty(); });
    this.sample.addEventListener('click', () => { this.handlers.onSample(); });
    this.forget.addEventListener('click', () => { this.handlers.onForget(); });
  }

  mount() {
    (this.doc.body ?? this.doc.documentElement).append(this.host);
  }

  open() {
    this.box.hidden = false;
    this.toggle.hidden = true;
    this.handlers.onOpen();
  }

  shut() {
    this.box.hidden = true;
    this.toggle.hidden = false;
  }

  /** El boton flotante lleva la cuenta de la bandeja sin necesidad de abrir el panel. */
  badge(count) {
    this.toggle.textContent = count > 0 ? `Errores (${String(count)})` : 'Errores';
  }

  render(view) {
    this.box.className = `box ${view.tone}`;
    this.status.textContent = view.title;
    this.detail.textContent = view.detail;
    const pending = view.tray?.count ?? 0;
    this.copy.textContent = pending > 0 ? `Copiar todo (${String(pending)})` : 'Copiar todo';
    this.copy.disabled = pending === 0;
    this.empty.disabled = pending === 0;
    this.tray.textContent = view.trayText ?? '';
    this.counts.hidden = !view.counts;
    if (view.counts) {
      this.counts.textContent = '';
      this.counts.append(
        element(this.doc, 'b', { textContent: 'Para la cabecera de la sesion: ' }),
        this.doc.createTextNode(`${String(view.counts.checked)} respuestas comprobadas, ${String(view.counts.correct)} aciertos.`),
      );
    }
    this.note.textContent = view.note ?? '';
    if (view.note === '') this.note.textContent = '';
  }

  /** Copia con los tres caminos: API moderna, execCommand y seleccion manual. */
  async deliver(text, done) {
    this.area.value = text;
    try {
      await this.doc.defaultView.navigator.clipboard.writeText(text);
      this.area.hidden = true;
      done('Copiado. Pegalo en «Errores para importar» del error-log.');
      return;
    } catch {
      // Un iframe de otro origen no suele tener permiso de portapapeles: seguimos.
    }
    this.area.hidden = false;
    this.area.focus();
    this.area.select();
    let copied = false;
    try {
      copied = this.doc.execCommand('copy');
    } catch {
      copied = false;
    }
    done(copied
      ? 'Copiado. Pegalo en «Errores para importar» del error-log.'
      : 'Seleccionado abajo: pulsa Ctrl+C para copiarlo.');
  }
}


// ----- src/dom/main.js -----
/**
 * Union de las piezas: observa el ejercicio, detecta la correccion y entrega el bloque.
 *
 * Hay dos caminos. Si la pagina es el reproductor RCF de Macmillan, se usa su marcado
 * real, que conocemos. Si no, se cae al detector generico, que descubre la senal de
 * correccion observando que cambia al corregir. Los dos fallan en cerrado.
 */


const SETTLE_MS = 300;
const TRAY_KEY = 'errorlog-macmillan:tray';
const DONE_KEY = 'errorlog-macmillan:done';

const EXPLANATION_HINT = '[class*=feedback], [class*=explanation], [class*=rationale], [data-feedback], [class*=explicacion]';

function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento la bandeja dura lo que dure la pestana.
  }
}

/**
 * En Macmillan el ejercicio vive en el marco del reproductor. El visor del libro y las
 * paginas sueltas tienen campos (zoom, buscador, notas) que el detector generico tomaria
 * por respuestas, y saldria un panel en cada marco. Ahi nos callamos salvo que de verdad
 * haya algo corregido que ensenar.
 */
function onMacmillan(doc) {
  return /macmillaneducation\.com/.test(doc.defaultView?.location?.href ?? '');
}

function start(doc) {
  const root = doc.body ?? doc.documentElement;
  if (!root) return null;
  const quietHost = onMacmillan(doc);

  const store = new AnswerStore();
  const state = {
    mode: 'generic',
    phase: 'idle',
    activity: { key: '', label: '' },
    attempt: 1,
    controls: [],
    byElement: new Map(),
    questions: [],
    baseline: new Map(),
    verdicts: new Map(),
    tray: load(TRAY_KEY, []),
    done: new Set(load(DONE_KEY, [])),
    unsupported: 0,
    note: '',
    // Camino Macmillan: lo ultimo visto sin corregir, y lo que habia justo al corregir.
    preMark: new Map(),
    atMark: null,
    read: null,
  };

  const panel = new Panel(doc, {
    onOpen: () => { render(); },
    onCopy: () => { copyErrors(); },
    onEmpty: () => { emptyTray(); },
    onSample: () => { copySample(); },
    onForget: () => { forget(); },
  });

  function switchActivity(key, label) {
    if (key === state.activity.key) return;
    state.activity = { key, label };
    state.attempt = 1;
    state.preMark = new Map();
    state.atMark = null;
    state.verdicts = new Map();
    state.read = null;
    state.note = '';
    store.reset();
  }

  // ---------------------------------------------------------------- Macmillan

  function evaluateMacmillan(activity) {
    state.mode = 'macmillan';
    const key = activity.getAttribute('data-rcfxmlid') ?? activity.id ?? '';
    switchActivity(key, tidy(activity.getAttribute('data-rcfxmlid') ?? 'actividad'));

    if (!isMarked(activity)) {
      // Sin corregir: es el momento de quedarnos con lo que he respondido yo.
      for (const [id, value] of readAnswers(activity)) {
        if (value !== '') state.preMark.set(id, value);
      }
      if (state.phase === 'ready') state.attempt += 1;
      state.read = null;
      state.atMark = null;
      state.verdicts = new Map();
      state.phase = 'uncorrected';
      return;
    }

    const read = readActivity(activity, doc);
    if (!read.ok) {
      state.phase = read.reason;
      state.read = null;
      return;
    }
    // Lo que habia en cada hueco en el momento de corregir: eso es lo que se califico.
    // Se toma una sola vez, para que un cambio posterior se pueda leer como revelacion.
    if (state.atMark === null) state.atMark = new Map(read.answers);
    state.read = read;
    state.questions = read.questions;
    state.verdicts = read.verdicts;
    state.unsupported = 0;
    state.phase = 'ready';
  }

  /**
   * Mi respuesta es la que habia al corregir, que es la que la plataforma califico. Si
   * ese hueco salio vacio pero yo si habia contestado antes, vale lo de antes: eso pasa
   * cuando la propia plataforma limpia el campo al corregir.
   */
  function macmillanAnswers() {
    const map = new Map();
    for (const [id, current] of state.read.answers) {
      const graded = state.atMark?.get(id) ?? '';
      map.set(id, graded !== '' ? graded : (state.preMark.get(id) ?? current));
    }
    return map;
  }

  /**
   * Solucion revelada: el valor cambia DESPUES de haber corregido, con la actividad ya
   * corregida. Si se comparase con lo de antes de corregir, al reintentar mi propia
   * respuesta nueva pasaria por solucion, que no lo es.
   */
  function macmillanSolutions() {
    const map = new Map();
    if (state.atMark === null) return map;
    for (const [id, current] of state.read.answers) {
      const graded = state.atMark.get(id);
      if (graded !== undefined && current !== '' && current !== graded) map.set(id, current);
    }
    return map;
  }

  // ------------------------------------------------------------------ Generico

  function scan() {
    const { controls, byElement } = findControls(root);
    state.controls = controls;
    state.byElement = byElement;
    state.questions = buildQuestions(root, controls, byElement);
    state.unsupported = detectUnsupported(root);
    return controls;
  }

  function rebaseline(controls) {
    state.baseline = new Map(controls.map((control) => [control.id, snapshotState(control)]));
  }

  function answeredOf(control) {
    return tidy(store.answerOf(control.id)) !== '' || tidy(readValue(control)) !== '';
  }

  function speaks(control) {
    const input = toSignalInput(control, state.baseline.get(control.id), snapshotState(control), answeredOf(control));
    return discoverVerdicts([input]).ok;
  }

  function evaluateGeneric() {
    state.mode = 'generic';
    const controls = scan();
    const activity = activityKeyOf(doc, root);
    if (activity.key !== state.activity.key) {
      switchActivity(activity.key, activity.label);
      rebaseline(controls);
    }

    if (controls.length === 0) {
      state.phase = 'empty';
      return;
    }

    if (state.phase === 'ready') {
      for (const control of controls) store.observeReveal(control);
      if (controls.some((control) => speaks(control))) return;
      store.reset();
      state.verdicts = new Map();
      state.attempt += 1;
      rebaseline(controls);
      state.phase = 'idle';
    }

    for (const control of controls) {
      if (!state.baseline.has(control.id)) state.baseline.set(control.id, snapshotState(control));
    }

    const inputs = controls.map((control) => toSignalInput(
      control,
      state.baseline.get(control.id),
      snapshotState(control),
      answeredOf(control),
    ));
    const found = discoverVerdicts(inputs);
    if (!found.ok) {
      state.phase = found.reason;
      return;
    }
    store.freeze(controls);
    state.verdicts = found.verdicts;
    state.phase = 'ready';
  }

  function explanationOf(control) {
    const [first] = control.elements;
    if (!first) return '';
    const container = first.closest('li, div, section, p') ?? root;
    const node = container.querySelector(EXPLANATION_HINT) ?? container.parentElement?.querySelector(EXPLANATION_HINT);
    return tidy(node?.textContent ?? '');
  }

  function genericSolutions() {
    const map = new Map();
    for (const control of state.controls) {
      const revealed = store.solutionOf(control.id);
      if (revealed !== '') map.set(control.id, revealed);
    }
    return map;
  }

  function genericExplanations() {
    const map = new Map();
    for (const control of state.controls) {
      const text = explanationOf(control);
      if (text !== '') map.set(control.id, text);
    }
    return map;
  }

  // --------------------------------------------------------------------- Comun

  function evaluate() {
    const activity = findActivity(doc);
    if (activity) evaluateMacmillan(activity);
    else evaluateGeneric();
  }

  /** Huecos que la plataforma acaba de dar por buenos, con el valor que acepto. */
  function confirmedNow() {
    const confirmed = new Map();
    if (state.phase !== 'ready') return confirmed;
    if (state.mode === 'macmillan') {
      for (const [gapId, verdict] of state.verdicts) {
        if (verdict !== 'correct') continue;
        const value = tidy(state.read?.answers.get(gapId) ?? '');
        if (value !== '') confirmed.set(gapId, value);
      }
      return confirmed;
    }
    for (const control of state.controls) {
      if (state.verdicts.get(control.id) !== 'correct') continue;
      const value = tidy(store.answerOf(control.id)) || tidy(readValue(control));
      if (value !== '') confirmed.set(control.id, value);
    }
    return confirmed;
  }

  function currentEntries() {
    if (state.phase !== 'ready') return [];
    if (state.mode === 'macmillan') {
      return toImportEntries({
        questions: state.questions,
        verdicts: state.verdicts,
        answers: macmillanAnswers(),
        solutions: macmillanSolutions(),
        explanations: new Map(),
      });
    }
    for (const control of state.controls) store.observeReveal(control);
    return toImportEntries({
      questions: state.questions,
      verdicts: state.verdicts,
      answers: store.answers(),
      solutions: genericSolutions(),
      explanations: genericExplanations(),
    });
  }

  function currentRows() {
    return currentEntries().map((entry) => entry.row);
  }

  /** Huellas de esta actividad que ya estan esperando en la bandeja. */
  function waitingHere(rows) {
    const marks = new Set(state.tray.map((entry) => entry.mark));
    return rows.filter((row) => marks.has(rowFingerprint(row, state.activity.key))).length;
  }

  /**
   * Guarda en la bandeja los fallos de la actividad recien corregida. Se hace solo: la
   * gracia es hacer varios ejercicios seguidos y revisarlos todos juntos al final.
   */
  function collect() {
    if (state.phase !== 'ready') return;
    const entries = currentEntries().map(({ gapId, row }) => ({
      mark: rowFingerprint(row, state.activity.key),
      row,
      gapId,
      activityKey: state.activity.key,
    }));
    const added = addToTray(state.tray, state.done, entries);
    state.full = added.full;

    // Un hueco que ahora esta bien confirma la solucion del fallo que guardamos antes.
    const settled = confirmAnswers(added.tray, state.activity.key, confirmedNow());
    state.confirmed = settled.updated;

    if (added.added === 0 && added.updated === 0 && settled.updated === 0) return;
    state.tray = settled.tray;
    save(TRAY_KEY, state.tray);
    if (settled.updated > 0) {
      state.note = settled.updated === 1
        ? 'Macmillan ha confirmado la solucion de 1 fallo guardado.'
        : `Macmillan ha confirmado la solucion de ${String(settled.updated)} fallos guardados.`;
    }
  }

  function countsNow() {
    if (state.mode === 'macmillan') return state.read?.counts ?? null;
    return summarize(state.controls, state.verdicts);
  }

  function view() {
    if (state.phase === 'empty' && state.unsupported > 0) return { ...describe({ phase: 'unreadable' }), counts: null };
    if (state.phase !== 'ready') return { ...describe({ phase: state.phase }), counts: null };

    const counts = countsNow();
    const rows = currentRows();
    const base = describe({
      phase: 'ready',
      incorrect: rows.length,
      correct: counts?.correct ?? 0,
      checked: counts?.checked ?? 0,
      fresh: waitingHere(rows),
    });

    let warning = '';
    if (state.mode === 'macmillan' && state.read && !state.read.verified) {
      warning = ` Aviso: este tipo de actividad (${state.read.interactions.join(', ') || 'sin declarar'}) no lo he comprobado contra Macmillan todavia; repasa el resultado.`;
    } else if (state.mode === 'generic' && state.unsupported > 0) {
      warning = ' Aviso: hay partes de este ejercicio que no se leer (arrastrar y soltar); repasa por si falta algun fallo.';
    }
    if (state.full) {
      warning += ` Aviso: la bandeja esta llena (${String(MAX_TRAY)}). Copia lo que hay antes de seguir.`;
    }
    return { ...base, detail: base.detail + warning, counts };
  }

  function render() {
    const current = view();
    const stats = trayStats(state.tray);
    const nothingHere = state.mode === 'generic' && state.controls.length === 0;
    const notTheExercise = quietHost && state.mode === 'generic' && state.phase !== 'ready';
    // Con fallos esperando, el panel se queda visible aunque este en otra pantalla:
    // si no, no habria forma de copiarlos al terminar la sesion.
    panel.host.hidden = (nothingHere || notTheExercise) && stats.count === 0;
    panel.render({
      ...current,
      tray: stats,
      trayText: describeTray(state.tray),
      note: state.note,
    });
    panel.badge(stats.count);
  }

  function copyErrors() {
    // Leemos la pagina justo ahora: si acabas de corregir, o si la plataforma acaba de
    // revelar la solucion, eso tiene que entrar en lo que copias y no esperar al proximo
    // repaso automatico.
    evaluate();
    collect();
    if (state.tray.length === 0) {
      state.note = 'La bandeja esta vacia.';
      render();
      return;
    }
    const { batch, rest } = takeBatch(state.tray, MAX_BATCH_ROWS);
    // Se da por despachado al entregar el bloque, no al confirmar el portapapeles: el
    // texto ya esta en el cuadro aunque el navegador niegue el permiso de copia.
    state.done = markDone(state.done, batch.map((entry) => entry.mark));
    state.tray = rest;
    state.full = false;
    save(TRAY_KEY, state.tray);
    save(DONE_KEY, [...state.done]);
    void panel.deliver(toJson(batch.map((entry) => entry.row)), (message) => {
      state.note = rest.length > 0
        ? `${message} Quedan ${String(rest.length)} en la bandeja: vuelve a pulsar para la siguiente tanda.`
        : message;
      render();
    });
  }

  /** Tirar la bandeja no debe hacer que esos mismos fallos vuelvan a entrar solos. */
  function emptyTray() {
    const count = state.tray.length;
    state.done = markDone(state.done, state.tray.map((entry) => entry.mark));
    state.tray = [];
    state.full = false;
    save(TRAY_KEY, state.tray);
    save(DONE_KEY, [...state.done]);
    state.note = `Bandeja vaciada: ${String(count)} descartados.`;
    render();
  }

  function copySample() {
    const activity = findActivity(doc);
    const question = state.questions[0] ?? (activity ? { container: activity, segments: [] } : null);
    const text = buildSample({
      doc,
      question,
      controls: state.controls,
      store,
      note: `${state.mode}/${state.phase}`,
    });
    void panel.deliver(text, (message) => {
      state.note = message;
      render();
    });
  }

  function forget() {
    state.done = new Set();
    save(DONE_KEY, []);
    // Recogemos ya, sin esperar a que la pagina vuelva a moverse.
    collect();
    state.note = 'Olvidado lo ya copiado: los fallos de esta actividad vuelven a la bandeja.';
    render();
  }

  const controlIdAt = (target) => {
    if (!target || !target.closest) return null;
    const control = state.byElement.get(target);
    if (control) return { controlId: control.id, control };
    return null;
  };

  trackUserInput(root, store, controlIdAt);

  let timer = null;
  const settle = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const before = state.phase;
      const beforeTray = state.tray.length;
      evaluate();
      collect();
      if (state.phase !== before || state.tray.length !== beforeTray) render();
    }, SETTLE_MS);
  };

  const observer = new MutationObserver(settle);
  observer.observe(root, { subtree: true, childList: true, attributes: true });

  panel.mount();
  evaluate();
  collect();
  render();

  return { state, store, evaluate, view, panel, observer, currentRows };
}


// ----- arranque -----
// Corre en el documento principal y en el iframe del reproductor. Donde no haya
// ejercicio, el panel se queda oculto y no molesta.
try {
  const api = start(document);
  // Solo para diagnosticar un formato que no sale bien. Se activa a mano con
  // localStorage['errorlog-macmillan:debug'] = '1' y por defecto no expone nada.
  if (window.localStorage.getItem('errorlog-macmillan:debug') === '1') window.__errorLogCapture = api;
} catch (problem) {
  console.error('[error-log] no he podido arrancar en este marco:', problem);
}

})();
