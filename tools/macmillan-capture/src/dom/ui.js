/**
 * Panel flotante dentro del marco del ejercicio.
 *
 * Vive en un shadow root para que ni la hoja de estilos de Macmillan nos afecte ni
 * nosotros afectemos a la suya, y va marcado con `data-errorlog-ui` para que el lector
 * del ejercicio se salte nuestra propia interfaz.
 *
 * Misma identidad que la app (papel, tinta, verde de marca), en cristal porque flota
 * sobre el ejercicio. «Copiar tanda» no vacía nada: copiada no significa guardada. Vaciar
 * pide confirmación y dice qué se descarta.
 */

import { UI_ATTR } from './collect.js';

/** Iconos Lucide (licencia ISC), en línea: sin React ni peticiones de red. */
const ICON = {
  more: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
};

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.box, .toggle {
  --bg: #F6F5F1; --ink: #20231F; --ink2: #5B6259; --rule: #DADDD5; --control: #7C847A;
  --brand: #304F46; --ok: #276544; --warn: #805509; --danger: #B23830; --hover: #ECEDEA;
  font: 14px/20px 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
.box {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 340px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto;
  background: rgba(255,255,255,.76);
  -webkit-backdrop-filter: blur(20px) saturate(1.5); backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgba(255,255,255,.8); outline: 1px solid rgba(32,35,31,.14);
  border-radius: 10px; box-shadow: 0 18px 44px rgba(32,35,31,.24);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .box { background: #fff; }
  .toggle { background: #fff !important; }
}
.box[hidden], [hidden] { display: none !important; }
.head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--rule); }
.mark { display: block; width: 8px; height: 8px; background: var(--brand); flex-shrink: 0; }
.title { flex: 1; margin: 0; font-size: 14px; font-weight: 600; outline: none; }
.icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0;
  border: 0; border-radius: 4px; background: transparent; color: var(--ink); cursor: pointer; }
.icon:hover { background: var(--hover); }
.body { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.status { margin: 0; font-size: 15px; font-weight: 600; line-height: 21px; }
.detail { margin: -8px 0 0; color: var(--ink2); font-size: 13px; line-height: 18px; }
.good .status { color: var(--ok); }
.problem .status { color: var(--danger); }
.info .status { color: var(--ink); }
.section { display: flex; flex-direction: column; gap: 4px; padding-top: 12px; border-top: 1px solid var(--rule); }
.kicker { color: var(--ink2); font-size: 13px; font-weight: 500; }
.tray { margin: 0; font-size: 16px; line-height: 22px; font-weight: 600; }
.counts { margin: 0; font-variant-numeric: tabular-nums; }
.missing { margin: 0; color: var(--warn); font-size: 13px; font-weight: 500; }
button { font: inherit; }
.primary { height: 44px; padding: 0 16px; border: 0; border-radius: 4px; background: var(--ink); color: #fff;
  font-weight: 500; cursor: pointer; white-space: nowrap; }
.primary:hover:not(:disabled) { background: #383C36; }
.primary:disabled { background: #8D928A; cursor: not-allowed; }
.secondary { height: 40px; padding: 0 14px; border: 1px solid var(--control); border-radius: 4px; background: #fff;
  color: var(--ink); font-weight: 500; cursor: pointer; }
.secondary:hover { background: var(--hover); }
.danger { height: 40px; padding: 0 14px; border: 0; border-radius: 4px; background: var(--danger); color: #fff;
  font-weight: 500; cursor: pointer; }
.note { margin: 0; font-size: 13px; line-height: 18px; color: var(--ink2); }
.note:empty { display: none; }
.copied { display: flex; flex-direction: column; gap: 2px; font-size: 13px; line-height: 18px; }
.copiedTitle { display: inline-flex; align-items: center; gap: 6px; color: var(--ok); font-weight: 500; }
.copiedHint { color: var(--ink2); }
.foot { display: flex; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid var(--rule); }
.link { padding: 0; border: 0; background: none; color: var(--ink); font-size: 14px; cursor: pointer; text-align: left; }
.link:hover:not(:disabled) { text-decoration: underline; }
.link:disabled { color: #A5ABA2; cursor: default; }
.link.red { color: var(--danger); }
.menu { display: flex; flex-direction: column; gap: 2px; padding: 8px 16px 0; }
.menu .link { padding: 6px 0; }
.menuHelp { margin: 0 0 4px; color: var(--ink2); font-size: 12px; line-height: 16px; }
.confirm { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.confirm strong { font-weight: 600; }
.confirm p { margin: 0; color: var(--ink2); }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
textarea {
  width: 100%; min-height: 120px; padding: 8px 10px;
  font: 12px/1.5 'IBM Plex Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
  color: var(--ink); background: #fff; border: 1px solid var(--control); border-radius: 4px;
}
.toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px;
  background: rgba(255,255,255,.76);
  -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid rgba(32,35,31,.2); border-radius: 6px; box-shadow: 0 8px 20px rgba(32,35,31,.18);
  font-weight: 500; white-space: nowrap; cursor: pointer;
}
.toggle:hover { background: rgba(255,255,255,.92); }
:focus-visible { outline: 2px solid #304F46; outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) {
  .box:not([hidden]) { animation: pop .16s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
}
`;

function element(doc, tag, props = {}) {
  const node = doc.createElement(tag);
  Object.assign(node, props);
  return node;
}

function iconButton(doc, icon, label) {
  const button = element(doc, 'button', { className: 'icon', type: 'button', innerHTML: icon });
  button.setAttribute('aria-label', label);
  return button;
}

export class Panel {
  constructor(doc, handlers) {
    this.doc = doc;
    this.handlers = handlers;
    this.view = null;
    this.host = element(doc, 'div');
    this.host.setAttribute(UI_ATTR, '');
    this.root = this.host.attachShadow({ mode: 'open' });

    const style = element(doc, 'style', { textContent: STYLE });
    this.toggle = element(doc, 'button', { className: 'toggle', type: 'button' });
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggleMark = element(doc, 'span', { className: 'mark' });
    this.toggleText = element(doc, 'span', { textContent: 'Error Log · sin errores' });
    this.toggle.append(this.toggleMark, this.toggleText);

    this.box = element(doc, 'div', { className: 'box info' });
    this.box.hidden = true;
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-label', 'Error Log C1');

    const head = element(doc, 'div', { className: 'head' });
    this.heading = element(doc, 'h1', { className: 'title', textContent: 'Error Log C1', tabIndex: -1 });
    this.more = iconButton(doc, ICON.more, 'Más opciones');
    this.more.setAttribute('aria-expanded', 'false');
    this.close = iconButton(doc, ICON.close, 'Cerrar panel');
    head.append(element(doc, 'span', { className: 'mark' }), this.heading, this.more, this.close);

    // Soporte técnico: no compite con copiar.
    this.menu = element(doc, 'div', { className: 'menu' });
    this.menu.hidden = true;
    this.sample = element(doc, 'button', { className: 'link', type: 'button', textContent: 'Copiar muestra tecnica' });
    this.forget = element(doc, 'button', { className: 'link', type: 'button', textContent: 'Olvidar lo exportado' });
    const forgetHelp = element(doc, 'p', {
      className: 'menuHelp',
      textContent: 'Vuelve a meter en la bandeja los fallos ya vaciados de las actividades que abras.',
    });
    this.menu.append(this.sample, this.forget, forgetHelp);

    this.main = element(doc, 'div', { className: 'body' });
    this.status = element(doc, 'p', { className: 'status' });
    this.detail = element(doc, 'p', { className: 'detail' });
    const section = element(doc, 'div', { className: 'section' });
    section.append(element(doc, 'span', { className: 'kicker', textContent: 'Tanda actual' }));
    this.tray = element(doc, 'p', { className: 'tray' });
    this.counts = element(doc, 'p', { className: 'counts' });
    this.missing = element(doc, 'p', { className: 'missing' });
    section.append(this.tray, this.counts, this.missing);
    this.copy = element(doc, 'button', { className: 'primary', type: 'button', textContent: 'Copiar tanda' });
    this.copied = element(doc, 'div', { className: 'copied' });
    this.copied.setAttribute('role', 'status');
    this.copied.hidden = true;
    const copiedTitle = element(doc, 'span', { className: 'copiedTitle', innerHTML: ICON.check });
    this.copiedText = element(doc, 'span', { textContent: 'Copiada. Pégala en Sesiones de Error Log.' });
    copiedTitle.append(this.copiedText);
    this.copied.append(copiedTitle, element(doc, 'span', {
      className: 'copiedHint',
      textContent: 'Copiada no significa guardada: la tanda se conserva hasta que la vacíes.',
    }));
    this.area = element(doc, 'textarea');
    this.area.hidden = true;
    this.area.setAttribute('aria-label', 'Bloque para copiar');
    this.note = element(doc, 'p', { className: 'note' });
    this.note.setAttribute('aria-live', 'polite');
    const foot = element(doc, 'div', { className: 'foot' });
    this.recopy = element(doc, 'button', { className: 'link', type: 'button', textContent: 'Volver a copiar la última' });
    this.empty = element(doc, 'button', { className: 'link red', type: 'button', textContent: 'Vaciar…' });
    foot.append(this.recopy, this.empty);
    this.main.append(this.status, this.detail, section, this.copy, this.copied, this.area, this.note, foot);

    // Confirmación de vaciar, en el propio panel.
    this.confirm = element(doc, 'div', { className: 'confirm' });
    this.confirm.hidden = true;
    this.confirmText = element(doc, 'p');
    this.keep = element(doc, 'button', { className: 'secondary', type: 'button', textContent: 'Cancelar' });
    this.discard = element(doc, 'button', { className: 'danger', type: 'button', textContent: 'Vaciar tanda' });
    const actions = element(doc, 'div', { className: 'actions' });
    actions.append(this.keep, this.discard);
    this.confirm.append(element(doc, 'strong', { textContent: '¿Vaciar la tanda actual?' }), this.confirmText, actions);

    this.box.append(head, this.menu, this.main, this.confirm);
    this.root.append(style, this.toggle, this.box);

    this.toggle.addEventListener('click', () => { this.open(); });
    this.close.addEventListener('click', () => { this.shut(); });
    this.more.addEventListener('click', () => { this.toggleMenu(); });
    this.copy.addEventListener('click', () => { this.handlers.onCopy(); });
    this.recopy.addEventListener('click', () => { this.handlers.onRecopy(); });
    this.sample.addEventListener('click', () => { this.handlers.onSample(); });
    this.forget.addEventListener('click', () => { this.handlers.onForget(); });
    this.empty.addEventListener('click', () => { this.askEmpty(); });
    this.keep.addEventListener('click', () => { this.cancelEmpty(); });
    this.discard.addEventListener('click', () => {
      this.cancelEmpty();
      this.handlers.onEmpty();
    });
    this.box.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (!this.confirm.hidden) this.cancelEmpty();
      else if (!this.menu.hidden) this.toggleMenu();
      else this.shut();
    });
  }

  mount() {
    (this.doc.body ?? this.doc.documentElement).append(this.host);
  }

  open() {
    this.box.hidden = false;
    this.toggle.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.handlers.onOpen();
    this.heading.focus();
  }

  shut() {
    this.box.hidden = true;
    this.toggle.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.focus();
  }

  toggleMenu() {
    this.menu.hidden = !this.menu.hidden;
    this.more.setAttribute('aria-expanded', String(!this.menu.hidden));
    if (!this.menu.hidden) this.sample.focus();
  }

  askEmpty() {
    const view = this.view;
    const count = view?.tray?.count ?? 0;
    const errores = count === 1 ? '1 error' : `${String(count)} errores`;
    const recuentos = view?.counts ? ` y los recuentos ${String(view.counts.correct)}/${String(view.counts.checked)}` : '';
    this.confirmText.textContent = `Se descartan ${errores}${recuentos}. No se puede deshacer.`;
    this.main.hidden = true;
    this.confirm.hidden = false;
    this.keep.focus();
  }

  cancelEmpty() {
    this.confirm.hidden = true;
    this.main.hidden = false;
    this.empty.focus();
  }

  /** El botón flotante lleva la cuenta de la bandeja sin necesidad de abrir el panel. */
  badge(count) {
    this.toggleText.textContent = count > 0
      ? `Error Log · ${String(count)} ${count === 1 ? 'error' : 'errores'}`
      : 'Error Log · sin errores';
  }

  render(view) {
    this.view = view;
    this.box.className = `box ${view.tone}`;
    this.status.textContent = view.title;
    this.detail.textContent = view.detail;
    const pending = view.tray?.count ?? 0;
    this.copy.textContent = pending === 0 && view.hasStudy ? 'Copiar sesión sin errores' : 'Copiar tanda';
    this.copy.disabled = pending === 0 && !view.hasStudy;
    this.empty.disabled = pending === 0 && !view.hasStudy;
    this.recopy.disabled = !view.hasLast;
    this.tray.textContent = view.trayText ?? '';
    this.counts.hidden = !view.counts;
    if (view.counts) {
      this.counts.textContent = `${String(view.counts.correct)} / ${String(view.counts.checked)} respuestas correctas`;
    }
    const missing = view.missing ?? 0;
    this.missing.hidden = missing === 0;
    this.missing.textContent = missing === 1
      ? '1 solución por completar en la revisión'
      : `${String(missing)} soluciones por completar en la revisión`;
    this.copied.hidden = !view.copied;
    this.note.textContent = view.note ?? '';
  }

  /** Deja el bloque completo accesible incluso cuando no se puede importar todavía. */
  show(text) {
    this.area.value = text;
    this.area.hidden = false;
    this.area.focus();
    this.area.select();
  }

  /**
   * Copia con los tres caminos: API moderna, execCommand y selección manual. `done` recibe
   * si quedó en el portapapeles; si no, el bloque queda seleccionado para copiarlo a mano.
   */
  async deliver(text, done) {
    this.area.value = text;
    try {
      await this.doc.defaultView.navigator.clipboard.writeText(text);
      this.area.hidden = true;
      done(true);
      return;
    } catch {
      // Un iframe de otro origen no suele tener permiso de portapapeles: seguimos.
    }
    this.show(text);
    let copied = false;
    try {
      copied = this.doc.execCommand('copy');
    } catch {
      copied = false;
    }
    done(copied);
  }
}
