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

import { tidy } from '../core/items.js';

/** Raiz de una actividad. `data-rcfxmlid` la identifica de forma estable. */
export const ACTIVITY_SELECTOR = '.dev-rcf-content.activity[data-rcfxmlid], .activity[data-rcfxmlid]';

/** Envoltorio que la plataforma marca al corregir cada hueco. */
const MARKABLE_SELECTOR = '.markable, .dev-markable-container';

/** Ruido que no debe entrar ni en el enunciado ni en mi respuesta. */
const NOISE_SELECTOR = '.mark, .visually-hidden, .globalAriaLive, script, style';

/** Interacciones comprobadas contra Macmillan de verdad. */
export const VERIFIED_INTERACTIONS = ['rcfDroppable'];

export function findActivity(doc) {
  return doc.querySelector(ACTIVITY_SELECTOR);
}

/** La plataforma añade `marked` a la actividad cuando la ha corregido. */
export function isMarked(activity) {
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
export function verdictOfMarkable(markable) {
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
export function readAnswers(activity) {
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
export function activityContextOf(activity) {
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
export function scoreOf(doc) {
  return tidy(doc.querySelector('[data-player-control=score-card-text]')?.textContent ?? '');
}

/**
 * Lee una actividad corregida.
 *
 * @returns {{ok: true, activityKey: string, interactions: string[], verified: boolean,
 *            questions: Array, verdicts: Map, answers: Map, counts: object}
 *          | {ok: false, reason: string}}
 */
export function readActivity(activity, doc) {
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
