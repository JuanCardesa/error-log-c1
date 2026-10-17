'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** Si la ventana cumple la consulta; se actualiza al cambiar de tamaño. En el servidor, no. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * Mientras una capa tapa la vista (el drawer en móvil, el detalle de un error o el panel de
 * Writing en pantalla estrecha), lo que queda debajo no se puede alcanzar: Tab no se escapa
 * detrás y el lector de pantalla no lo lee.
 *
 * Marca `inert` en todo lo que hay en `<main>` salvo el camino hasta la capa. La cabecera y
 * el aviso quedan fuera de `<main>` y siguen vivos: las capas empiezan bajo la cabecera, y
 * «Deshacer» tiene que poder pulsarse siempre. Lo que forma parte de la capa sin estar dentro
 * (su velo, que la cierra con un clic) lleva `data-layer-part`. Al cerrar, todo vuelve como estaba.
 */
export function useInertBehind(ref: RefObject<HTMLElement | null>, active: boolean): void {
  // En la fase de layout: al cerrar, el fondo deja de ser inerte antes de que se le devuelva el foco.
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!active || layer === null) return;
    const main = layer.closest('main');
    if (main === null) return;
    const touched: Element[] = [];
    for (let node: HTMLElement = layer; node !== main; ) {
      const parent: HTMLElement | null = node.parentElement;
      if (parent === null) break;
      for (const sibling of parent.children) {
        if (sibling === node || sibling.hasAttribute('inert') || sibling.hasAttribute('data-layer-part')) continue;
        sibling.setAttribute('inert', '');
        touched.push(sibling);
      }
      node = parent;
    }
    return () => {
      for (const element of touched) element.removeAttribute('inert');
    };
  }, [ref, active]);
}
