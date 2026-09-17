/**
 * Muestra tecnica minima.
 *
 * Sirve para escribir un adaptador cuando un formato no esta soportado. Lleva solo la
 * estructura de UNA pregunta y el estado de sus controles. No lleva cookies, ni tokens,
 * ni cabeceras, ni la query de la URL, ni nada de la cuenta.
 */

import { tidy } from '../core/items.js';
import { UI_ATTR } from './collect.js';
import { readValue } from './answers.js';

const MAX_HTML = 6000;

/** Atributos cuyo nombre ya delata que su valor no debe salir de aqui. */
const SECRET_NAME = /(token|auth|session|secret|password|pwd|signature|credential|api[-_]?key|bearer|jwt|cookie)/i;

/**
 * Valores con pinta de credencial. El hexadecimal pide 40 o mas a proposito: los
 * identificadores de contenido de Macmillan son de 32 y hacen falta para el adaptador.
 */
const SECRET_VALUE = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  /\b[A-Fa-f0-9]{40,}\b/g,
  /([?&][^=&\s"']*(?:token|secret|password|pwd|auth|session|key|credential|signature|code)[^=&\s"']*=)[^&"'\s]+/gi,
];

const HIDDEN = '[OCULTO]';

/**
 * Enmascara un valor por su forma: JWT, cadenas largas con pinta de clave y parametros
 * sensibles dentro de una URL. Sirve igual para un atributo, para un texto visible o
 * para una respuesta, que son las tres vias por las que algo puede salir de aqui.
 */
export function redactValue(value) {
  let safe = String(value);
  safe = safe.replace(SECRET_VALUE[0], HIDDEN);
  safe = safe.replace(SECRET_VALUE[1], HIDDEN);
  safe = safe.replace(SECRET_VALUE[2], `$1${HIDDEN}`);
  return safe;
}

/** Igual, pero el nombre del atributo por si solo ya puede condenar su valor. */
export function redact(name, value) {
  if (SECRET_NAME.test(String(name))) return HIDDEN;
  return redactValue(value);
}

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
    attrs.push(`${attribute.name}="${redact(attribute.name, attribute.value)}"`);
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
  // La muestra se comparte con alguien para escribir el adaptador, asi que ningun
  // atributo sale de aqui sin pasar antes por el enmascarado.
  for (const node of [clone, ...clone.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) {
      const safe = redact(attribute.name, attribute.value);
      if (safe !== attribute.value) node.setAttribute(attribute.name, safe);
    }
  }
  const walker = clone.ownerDocument.createTreeWalker(clone, 4);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    const safe = redactValue(node.nodeValue ?? '');
    if (safe !== node.nodeValue) node.nodeValue = safe;
  }
  const html = clone.outerHTML ?? '';
  return html.length > MAX_HTML ? `${html.slice(0, MAX_HTML)}\n<!-- recortado -->` : html;
}

/**
 * @param {{doc: Document, question: object|null, controls: Array, store: object, note: string}} input
 */
export function buildSample(input) {
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
    lines.push(`valor visible ahora: ${JSON.stringify(redactValue(readValue(control)))}`);
    lines.push(`mi respuesta guardada: ${JSON.stringify(redactValue(store.answerOf(control.id)))}`);
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
