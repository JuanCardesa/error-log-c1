/**
 * Panel flotante dentro del marco del ejercicio.
 *
 * Vive en un shadow root para que ni la hoja de estilos de Macmillan nos afecte ni
 * nosotros afectemos a la suya, y va marcado con `data-errorlog-ui` para que el lector
 * del ejercicio se salte nuestra propia interfaz.
 */

import { UI_ATTR } from './collect.js';

/**
 * El panel se pinta encima del ejercicio, que ya trae su propia tipografia pequena, asi
 * que aqui todo va con tamano y contraste propios: nada hereda de la pagina por el
 * `all: initial` del anfitrion. El boton flotante es rojo y grande a proposito, para que
 * se distinga del azul que usa Macmillan en sus controles.
 */
const STYLE = `
:host { all: initial; }
.box {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 390px; max-width: calc(100vw - 32px); max-height: 82vh; overflow: auto;
  font: 15px/1.55 system-ui, -apple-system, Segoe UI, sans-serif;
  background: #fff; color: #141414; border: 2px solid #c62828; border-radius: 12px;
  box-shadow: 0 10px 32px rgba(0,0,0,.30); padding: 16px;
}
.box[hidden] { display: none; }
h1 {
  font-size: 15px; margin: 0 0 12px; display: flex; align-items: center;
  justify-content: space-between; gap: 10px;
}
h1 span { font-weight: 700; }
h1 button { padding: 6px 11px; font-size: 13px; margin: 0; }
.status { margin: 0 0 6px; font-size: 18px; font-weight: 700; line-height: 1.3; }
.detail { margin: 0 0 12px; color: #2f2f2f; font-size: 14px; }
.good .status { color: #135c2c; }
.problem .status { color: #a01313; }
.info .status { color: #133f75; }
.counts, .tray { margin: 0 0 9px; padding: 10px 12px; border-radius: 8px; font-size: 14px; }
.counts { background: #eef1f6; color: #22303f; }
.tray { background: #e6f2e9; color: #17472a; font-weight: 700; }
.counts b { font-weight: 700; }
button {
  font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, sans-serif;
  padding: 11px 15px; margin: 0 8px 8px 0; cursor: pointer; color: #141414;
  border: 1px solid #949494; border-radius: 8px; background: #f1f1f1;
}
button:hover:not(:disabled) { background: #e3e3e3; }
button.primary { background: #133f75; border-color: #133f75; color: #fff; }
button.primary:hover:not(:disabled) { background: #0e2f58; }
button:disabled { opacity: .45; cursor: default; }
textarea {
  width: 100%; box-sizing: border-box; min-height: 130px; margin-top: 8px; padding: 9px;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
  color: #141414; background: #fcfcfc; border: 1px solid #b4b4b4; border-radius: 8px;
}
.toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  font: 700 16px/1.2 system-ui, -apple-system, Segoe UI, sans-serif;
  padding: 14px 22px; border-radius: 999px; cursor: pointer;
  border: 2px solid #8d1b1b; background: #c62828; color: #fff;
  box-shadow: 0 6px 20px rgba(0,0,0,.32);
}
.toggle:hover { background: #a81f1f; }
.note { color: #4a4a4a; font-size: 13px; margin: 12px 0 0; }
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
