import { tidy } from '../core/items.js';

/** Campos explícitos del visor; nunca se deduce la página de la URL o del id opaco. */
function contextText(doc, selector, attribute) {
  const node = doc.querySelector(selector);
  if (!node) return '';
  return tidy((attribute && node.getAttribute(attribute)) || node.value || node.textContent || '');
}

function contextPages(text) {
  const match = /^(?:(?:pages?|pág(?:ina)?s?\.?)\s*)?(\d+)(?:\s*[-–]\s*(\d+))?$/i.exec(text);
  if (!match) return [];
  const first = Number(match[1]);
  const last = Number(match[2] ?? match[1]);
  if (first < 1 || last < first || last - first > 10) return [];
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Marcos que alguna vez leyeron el visor; solo ellos retiran lo que publicaron. */
const publishers = new WeakSet();

/** Un contexto por pestaña del visor: otras pestañas no prestan su página. */
export function viewerContextKey(doc) {
  try {
    const tabStore = doc.defaultView.top.sessionStorage;
    const key = 'errorlog-macmillan:viewer-id';
    if (!tabStore.getItem(key)) tabStore.setItem(key, doc.defaultView.crypto.randomUUID());
    return `errorlog-macmillan:context:${tabStore.getItem(key)}`;
  } catch { return null; }
}

export function readStudyContext(doc, activity, key) {
  const documents = [doc];
  try {
    let frame = doc.defaultView;
    while (frame.parent !== frame) { frame = frame.parent; documents.push(frame.document); }
  } catch { /* El contexto compartido sigue disponible si un ancestro cambia de origen. */ }
  // Leer el visor en el momento de copiar evita depender del debounce del observador.
  const book = documents.map((scope) => contextText(scope, '[data-book-title]', 'data-book-title')
    || contextText(scope, '[data-testid="book-title"], [class*="bookTitle"], [class*="book-title"]')).find(Boolean) || '';
  const page = documents.map((scope) => contextText(scope, '[data-page-number]', 'data-page-number')
    || contextText(scope, '[data-testid="page-number"], [aria-label="Page number"], [aria-label="Número de página"], [class*="pageNumber"]')).find(Boolean) || '';
  const pages = contextPages(page);
  const scope = documents[documents.length - 1].defaultView.performance.timeOrigin;
  let shared = {};
  try {
    shared = key ? JSON.parse(doc.defaultView.localStorage.getItem(key) || '{}') : {};
    if (shared.scope !== scope) shared = {};
    // Solo los marcos que muestran el visor publican su contexto. Si la página ya no
    // se puede leer, se borra; no reutilizamos el número de la página anterior.
    if (key && (book || page)) {
      publishers.add(doc);
      shared = { book, pages, scope };
      doc.defaultView.localStorage.setItem(key, JSON.stringify(shared));
    } else if (key && publishers.has(doc)) {
      // El marco que publicaba ha dejado de ver el visor. Retira lo suyo en vez de
      // prestarle libro y página a la siguiente actividad. Un marco que nunca publicó
      // —el reproductor— no borra nada: es justo quien necesita leer el contexto.
      publishers.delete(doc);
      shared = {};
      doc.defaultView.localStorage.removeItem(key);
    }
  } catch { shared = {}; }
  const label = contextText(doc, '[data-activity-number]', 'data-activity-number')
    || contextText(doc, '[data-player-control="activity-title"], [data-player-control="activity-number"], [class*="activityTitle"]')
    || tidy(activity?.getAttribute('data-activity-number') ?? '');
  const number = /^(?:(?:activity|exercise|actividad|ejercicio)\s*)?(\d+)\s*$/i.exec(label)?.[1] ?? '';
  return { book: book || shared.book || '', pages: pages.length ? pages : shared.pages ?? [], activity: number };
}
