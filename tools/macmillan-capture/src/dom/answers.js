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
export function readValue(control) {
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
export function labelOf(element) {
  const byId = element.id ? element.ownerDocument?.querySelector(`label[for="${cssEscape(element.id)}"]`) : null;
  const wrapper = element.closest ? element.closest('label') : null;
  const text = byId?.textContent ?? wrapper?.textContent ?? element.value ?? '';
  return String(text).replace(/\s+/g, ' ').trim();
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/["\\]/g, '');
}

export class AnswerStore {
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
export function trackUserInput(root, store, controlIdAt) {
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
