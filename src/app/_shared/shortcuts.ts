'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { useT } from './i18nClient';

/**
 * Atajos de teclado. Las etiquetas dependen del sistema (⌘ en Mac, Ctrl en el resto) y, en
 * Windows, del idioma (Intro/Enter, Supr/Del), pero el gestor acepta `metaKey || ctrlKey`
 * en ambos: se enseña lo que toca y funciona lo que se pulse.
 */

export interface ShortcutLabels {
  readonly search: string;
  readonly save: string;
  readonly nextPending: string;
  readonly remove: string;
  readonly paste: string;
  readonly enter: string;
  readonly undo: string;
}

const WINDOWS: Omit<ShortcutLabels, 'save' | 'remove' | 'enter'> = {
  search: 'Ctrl+K',
  nextPending: 'Alt+↓',
  paste: 'Ctrl+V',
  undo: 'Ctrl+Z',
};

const MAC: ShortcutLabels = {
  search: '⌘K',
  save: '⌘↵',
  nextPending: '⌥↓',
  remove: '⌥⌦',
  paste: '⌘V',
  enter: '↵',
  undo: '⌘Z',
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
  const { shortcuts } = useT();
  return useMemo(() => (mac ? MAC : { ...WINDOWS, ...shortcuts }), [mac, shortcuts]);
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
