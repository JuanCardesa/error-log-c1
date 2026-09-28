'use client';

import { useSyncExternalStore } from 'react';

/**
 * Atajos de teclado. Las etiquetas dependen del sistema (⌘ en Mac, Ctrl en el resto),
 * pero el gestor acepta `metaKey || ctrlKey` en ambos: se enseña lo que toca y funciona
 * lo que se pulse.
 */

export interface ShortcutLabels {
  readonly search: string;
  readonly save: string;
  readonly nextPending: string;
  readonly remove: string;
  readonly paste: string;
  readonly enter: string;
}

const WINDOWS: ShortcutLabels = {
  search: 'Ctrl+K',
  save: 'Ctrl+Intro',
  nextPending: 'Alt+↓',
  remove: 'Alt+Supr',
  paste: 'Ctrl+V',
  enter: 'Intro',
};

const MAC: ShortcutLabels = {
  search: '⌘K',
  save: '⌘↵',
  nextPending: '⌥↓',
  remove: '⌥⌦',
  paste: '⌘V',
  enter: '↵',
};

interface NavigatorWithUAData extends Navigator {
  readonly userAgentData?: { readonly platform?: string };
}

function isMac(): boolean {
  const nav = navigator as NavigatorWithUAData;
  return /Mac|iPhone|iPad/i.test(nav.userAgentData?.platform ?? nav.platform);
}

const subscribe = () => () => undefined;

/** En el servidor se pintan las de Windows; el cliente corrige al hidratar si es Mac. */
export function useShortcutLabels(): ShortcutLabels {
  const mac = useSyncExternalStore(subscribe, isMac, () => false);
  return mac ? MAC : WINDOWS;
}

/**
 * Si el foco está donde una tecla suelta escribe o activa algo. Los atajos de una letra
 * no se disparan ahí.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName);
}

/** Tecla suelta sin modificadores, fuera de un campo y sin capas abiertas encima. */
export function isPlainKey(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return false;
  if (isTypingTarget(event.target)) return false;
  // Un dialog modal o el drawer mandan: los atajos de página esperan.
  return document.querySelector('dialog[open], [data-overlay-open]') === null;
}
