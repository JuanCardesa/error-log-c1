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
export function tokenParts(token) {
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
export function classifyToken(token) {
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
export function classifyAttribute(name, value) {
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

/**
 * Un hueco que a la vez dice acierto y fallo no es un hueco «sin senal»: es una senal
 * que no entendemos. Se distingue de `null` para poder fallar en cerrado en vez de
 * dejar que otro candidato decida por el.
 */
const CONFLICT = 'conflict';

/** Veredicto unico de una lista de tokens: `null` si ninguno dice nada. */
function verdictOf(tokens) {
  let verdict = null;
  for (const token of tokens) {
    const found = classifyToken(token);
    if (found === null) continue;
    if (verdict !== null && verdict !== found) return CONFLICT;
    verdict = found;
  }
  return verdict;
}

function verdictOfAttributes(pairs) {
  let verdict = null;
  for (const pair of pairs) {
    const found = classifyAttribute(pair.name, pair.value);
    if (found === null) continue;
    if (verdict !== null && verdict !== found) return CONFLICT;
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
  let conflict = false;
  for (const control of controls) {
    const fresh = added(control.classesBefore ?? [], control.classesAfter ?? []);
    const found = verdictOf(fresh);
    if (found === CONFLICT) conflict = true;
    else if (found !== null) verdicts.set(control.id, found);
  }
  return { source: 'clases', verdicts, conflict };
}

/** Candidato por atributos de estado nuevos o cambiados al corregir. */
function attributeCandidate(controls) {
  const verdicts = new Map();
  let conflict = false;
  for (const control of controls) {
    const before = new Map((control.attrsBefore ?? []).map((pair) => [pair.name, pair.value]));
    const fresh = (control.attrsAfter ?? []).filter((pair) => before.get(pair.name) !== pair.value);
    const found = verdictOfAttributes(fresh);
    if (found === CONFLICT) conflict = true;
    else if (found !== null) verdicts.set(control.id, found);
  }
  return { source: 'atributos', verdicts, conflict };
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
export function discoverVerdicts(controls) {
  const list = Array.isArray(controls) ? controls : [];
  if (list.length === 0) return { ok: false, reason: 'empty' };
  if (!hasAnyChange(list)) return { ok: false, reason: 'uncorrected' };

  const candidates = [ariaCandidate(list), attributeCandidate(list), classCandidate(list)];
  // Si una senal se contradice a si misma en algun hueco, no dejamos que otra decida por
  // ella: es que no estamos leyendo bien este formato.
  if (candidates.some((candidate) => candidate.conflict)) return { ok: false, reason: 'conflict' };
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
