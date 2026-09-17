/**
 * Panel flotante dentro del marco del ejercicio.
 *
 * Vive en un shadow root para que ni la hoja de estilos de Macmillan nos afecte ni
 * nosotros afectemos a la suya, y va marcado con `data-errorlog-ui` para que el lector
 * del ejercicio se salte nuestra propia interfaz.
 */

import { UI_ATTR } from './collect.js';

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

export class Panel {
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
