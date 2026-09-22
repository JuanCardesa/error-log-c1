/**
 * Union de las piezas: observa el ejercicio, detecta la correccion y entrega el bloque.
 *
 * Hay dos caminos. Si la pagina es el reproductor RCF de Macmillan, se usa su marcado
 * real, que conocemos. Si no, se cae al detector generico, que descubre la senal de
 * correccion observando que cambia al corregir. Los dos fallan en cerrado.
 */

import { discoverVerdicts } from '../core/signals.js';
import { summarize, tidy } from '../core/items.js';
import { fingerprint, MAX_EXPORT_LENGTH, rowFingerprint, toImportEntries, toJson } from '../core/exportable.js';
import { addToTray, confirmAnswers, describeTray, markDone, MAX_TRAY, normalizeTray, trayStats } from '../core/tray.js';
import { emptyStudy, normalizeStudy, recordStudy, studySession } from '../core/study.js';
import { readStudyContext, viewerContextKey } from './context.js';
import { describe } from '../core/report.js';
import { AnswerStore, readValue, trackUserInput } from './answers.js';
import { activityKeyOf, buildQuestions, createRegistry, detectUnsupported, findControls, snapshotState, toSignalInput } from './collect.js';
import { findActivity, isMarked, looksLikePlayer, readActivity, readAnswers, sampleContainerOf } from './macmillan.js';
import { buildSample } from './sample.js';
import { Panel } from './ui.js';

const SETTLE_MS = 300;
const TRAY_KEY = 'errorlog-macmillan:tray';
const DONE_KEY = 'errorlog-macmillan:done';
const STUDY_KEY = 'errorlog-macmillan:study';
const STUDY_DONE_KEY = 'errorlog-macmillan:study-done';

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

/** Las listas guardadas se descartan enteras si no lo son: un objeto suelto rompe todo. */
function loadList(key, fallback) {
  const value = load(key, fallback);
  return Array.isArray(value) ? value : fallback;
}

/** Igual para el diccionario de tandas ya exportadas, que se indexa por clave. */
function loadMarks(key, fallback) {
  const value = load(key, fallback);
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
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

export function start(doc) {
  const root = doc.body ?? doc.documentElement;
  if (!root) return null;
  const quietHost = onMacmillan(doc);
  const contextKey = viewerContextKey(doc);

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
    registry: createRegistry(),
    verdicts: new Map(),
    tray: normalizeTray(load(TRAY_KEY, [])),
    done: new Set(loadList(DONE_KEY, [])),
    study: normalizeStudy(load(STUDY_KEY, null)),
    studyDone: loadMarks(STUDY_DONE_KEY, {}),
    context: {},
    unsupported: 0,
    note: '',
    // Camino Macmillan: lo que consta que he escrito yo, y lo que habia al corregir.
    typed: new Map(),
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
    // Otra actividad, otros huecos: nadie hereda el identificador de nadie.
    state.registry = createRegistry();
    state.typed = new Map();
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
      // Intento nuevo: lo escrito en el anterior no cuenta para este.
      if (state.phase === 'ready') {
        state.attempt += 1;
        state.typed = new Map();
      }
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
   * Mi respuesta, por orden de fiabilidad.
   *
   * Primero lo que consta que he tecleado yo en ese hueco, porque de eso no hay duda y
   * manda sobre lo demas: hay actividades que sustituyen el campo por la solucion en el
   * mismo momento de corregir, y si no se perderia lo que puse.
   *
   * Si no he tecleado nada ahi, como en las de arrastrar, vale lo que habia en el hueco
   * al corregir, que es lo que la plataforma califico. Y si tampoco habia nada, la
   * respuesta consta vacia: dejarla vacia es honesto, rellenarla de otro sitio no.
   */
  function macmillanAnswers() {
    const map = new Map();
    for (const [id] of state.read.answers) {
      const typed = state.typed.get(id) ?? '';
      map.set(id, typed !== '' ? typed : (state.atMark?.get(id) ?? ''));
    }
    return map;
  }

  /**
   * La plataforma revela la solucion de dos maneras, y las dos se reconocen por lo mismo:
   * un valor que yo no he puesto. O sustituye mi respuesta en el momento de corregir, o
   * la cambia despues, al mostrar las respuestas.
   *
   * Nunca se compara con lo de antes de corregir a secas: al reintentar, mi propia
   * respuesta nueva pasaria por solucion, y no lo es.
   */
  function macmillanSolutions() {
    const map = new Map();
    if (state.atMark === null) return map;
    for (const [id, current] of state.read.answers) {
      const typed = state.typed.get(id) ?? '';
      const graded = state.atMark.get(id) ?? '';
      if (typed !== '' && graded !== '' && graded !== typed) map.set(id, graded);
      else if (graded !== '' && current !== '' && current !== graded) map.set(id, current);
    }
    return map;
  }

  // ------------------------------------------------------------------ Generico

  function scan() {
    const { controls, byElement } = findControls(root, state.registry);
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
    let controls = scan();
    const activity = activityKeyOf(doc, root);
    if (activity.key !== state.activity.key) {
      switchActivity(activity.key, activity.label);
      // El registro se ha renovado: volvemos a leer para que los identificadores y la
      // linea base que guardamos sean los mismos.
      controls = scan();
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
    state.context = readStudyContext(doc, activity, contextKey);
    if (activity) {
      evaluateMacmillan(activity);
      return;
    }
    // En el reproductor, callarse no es una opcion: si la actividad no encaja hay que
    // decirlo y dejar a mano la muestra, que es lo unico que desatasca ese formato.
    if (quietHost && looksLikePlayer(doc)) {
      state.mode = 'macmillan';
      state.read = null;
      state.verdicts = new Map();
      state.questions = [];
      state.controls = [];
      state.phase = 'unknownActivity';
      return;
    }
    evaluateGeneric();
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
    syncShared();
    if (state.phase !== 'ready') return;
    const signature = fingerprint([...state.verdicts].map(([id, verdict]) => `${id}:${verdict}:${state.mode === 'macmillan' ? state.read?.answers.get(id) : store.answerOf(id)}`));
    const known = state.study.activities.find((entry) => entry.key === state.activity.key)?.signature;
    if (state.studyDone[state.activity.key] !== signature && known !== signature) {
      state.study = recordStudy(state.study, state.activity.key, state.verdicts, state.context, signature);
      save(STUDY_KEY, state.study);
    }
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

  // Los reproductores y el visor comparten origen. Antes de escribir se recoge lo
  // último que haya guardado otro marco, para no pisar su bandeja con una copia vieja.
  function syncShared() {
    state.tray = normalizeTray(load(TRAY_KEY, state.tray));
    state.done = new Set(loadList(DONE_KEY, [...state.done]));
    state.study = normalizeStudy(load(STUDY_KEY, state.study));
    state.studyDone = loadMarks(STUDY_DONE_KEY, state.studyDone);
  }

  function finishStudy() {
    for (const entry of state.study.activities) state.studyDone[entry.key] = entry.signature;
    state.study = emptyStudy();
    save(STUDY_KEY, state.study);
    save(STUDY_DONE_KEY, state.studyDone);
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
    panel.host.hidden = (nothingHere || notTheExercise) && stats.count === 0 && state.study.activities.length === 0;
    const header = studySession(state.study);
    panel.render({
      ...current,
      counts: state.study.activities.length > 0 ? { checked: header.itemsTotal, correct: header.itemsCorrect } : null,
      hasStudy: state.study.activities.length > 0,
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
    if (state.tray.length === 0 && state.study.activities.length === 0) {
      state.note = 'La bandeja esta vacia.';
      render();
      return;
    }
    const batch = state.tray;
    // Una bandeja de la versión anterior puede carecer de los recuentos de otras
    // actividades: se conserva su array compatible, nunca se inventa su denominador.
    const legacy = batch.some((entry) => !state.study.activities.some((activity) => activity.key === entry.activityKey));
    const json = toJson(batch.map((entry) => entry.row), legacy ? undefined : studySession(state.study));
    if (json.length > MAX_EXPORT_LENGTH) {
      panel.show(json);
      state.note = 'El bloque supera el tamaño del importador. Copia el texto completo de abajo a un editor y acorta los enunciados antes de importarlo. La bandeja y los recuentos se conservan.';
      render();
      return;
    }
    // Se da por despachado al entregar el bloque, no al confirmar el portapapeles: el
    // texto ya esta en el cuadro aunque el navegador niegue el permiso de copia.
    state.done = markDone(state.done, batch.map((entry) => entry.mark));
    state.tray = [];
    state.full = false;
    save(TRAY_KEY, state.tray);
    save(DONE_KEY, [...state.done]);
    finishStudy();
    void panel.deliver(json, (message) => {
      state.note = legacy ? `${message} Bandeja de una versión anterior: solo errores, completa la cabecera manualmente.` : message;
      render();
    });
  }

  /** Tirar la bandeja no debe hacer que esos mismos fallos vuelvan a entrar solos. */
  function emptyTray() {
    syncShared();
    const count = state.tray.length;
    state.done = markDone(state.done, state.tray.map((entry) => entry.mark));
    state.tray = [];
    state.full = false;
    save(TRAY_KEY, state.tray);
    save(DONE_KEY, [...state.done]);
    finishStudy();
    state.note = `Bandeja vaciada: ${String(count)} descartados.`;
    render();
  }

  function copySample() {
    const question = state.questions[0] ?? { container: sampleContainerOf(doc), segments: [] };
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
    state.studyDone = {};
    save(STUDY_DONE_KEY, {});
    // Recogemos ya, sin esperar a que la pagina vuelva a moverse.
    collect();
    state.note = 'Olvidado lo ya copiado: los fallos y recuentos de esta actividad vuelven a la bandeja. Abre las demás actividades para recuperarlos también.';
    render();
  }

  const controlIdAt = (target) => {
    if (!target || !target.closest) return null;
    const control = state.byElement.get(target);
    if (control) return { controlId: control.id, control };
    return null;
  };

  trackUserInput(root, store, controlIdAt);

  /**
   * En el reproductor de Macmillan no hay `scan()` que construya el mapa de controles, y
   * escribir en un campo no genera ninguna mutacion que observar. Asi que ahi nos
   * apoyamos en los eventos de usuario de verdad: mientras la actividad no este
   * corregida, lo que haya en los huecos lo he puesto yo.
   */
  const rememberMine = (event) => {
    if (!event.isTrusted) return;
    const activity = findActivity(doc);
    if (!activity || isMarked(activity)) return;
    const holder = event.target?.closest?.('[data-rcfid]');
    if (!holder || !activity.contains(holder)) return;
    const id = holder.getAttribute('data-rcfid');
    if (id === null) return;
    // Solo el hueco que estoy tocando: de los demas no se sabe quien los puso.
    const value = readAnswers(activity).get(id) ?? '';
    if (value === '') state.typed.delete(id);
    else state.typed.set(id, value);
  };
  for (const name of ['input', 'change', 'blur']) root.addEventListener(name, rememberMine, true);

  let timer = null;
  const settle = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const before = state.phase;
      const beforeTray = state.tray.length;
      const beforeStudy = JSON.stringify(state.study);
      evaluate();
      collect();
      if (state.phase !== before || state.tray.length !== beforeTray || JSON.stringify(state.study) !== beforeStudy) render();
    }, SETTLE_MS);
  };

  const observer = new MutationObserver(settle);
  observer.observe(root, { subtree: true, childList: true, attributes: true });

  doc.defaultView.addEventListener('storage', (event) => {
    if ([TRAY_KEY, DONE_KEY, STUDY_KEY, STUDY_DONE_KEY].includes(event.key)) { syncShared(); render(); }
    if (event.key === contextKey) settle();
  });

  panel.mount();
  evaluate();
  collect();
  render();

  return { state, store, evaluate, view, panel, observer, currentRows };
}
