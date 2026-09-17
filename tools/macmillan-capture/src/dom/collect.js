/**
 * Lectura del ejercicio: que controles hay, como se agrupan en preguntas y que estado
 * lleva cada uno. Aqui no se decide nada sobre aciertos ni fallos; solo se observa.
 */

import { classifyToken } from '../core/signals.js';
import { fingerprint } from '../core/exportable.js';
import { tidy } from '../core/items.js';

/** Marca de nuestra propia interfaz, para no leernos a nosotros mismos. */
export const UI_ATTR = 'data-errorlog-ui';

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
export function findControls(root) {
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
export function snapshotState(control) {
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
export function toSignalInput(control, before, after, answered) {
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
export function buildQuestions(root, controls, byElement) {
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
export function detectUnsupported(root) {
  const found = [...root.querySelectorAll(UNSUPPORTED_SELECTOR)].filter((element) => usable(element));
  return found.length;
}

/** Identidad de la actividad, para no mezclar ejercicios distintos. */
export function activityKeyOf(doc, root) {
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
