import { slug as githubSlug } from 'github-slugger';

/**
 * Dirección del lector: `/writing/12-making-cities-more-liveable`. Manda el número; el resto
 * solo se lee, así que el enlace sigue valiendo aunque cambie el título. Los textos antiguos,
 * sin título propio, se quedan en `/writing/12`.
 */
export function writingHref(piece: { readonly id: number; readonly title: string | null }): string {
  const suffix = piece.title === null ? '' : githubSlug(piece.title);
  return `/writing/${String(piece.id)}${suffix === '' ? '' : `-${suffix}`}`;
}

export function parseWritingKey(key: string): number | null {
  const match = /^([1-9]\d*)(?:-[^/]+)?$/u.exec(key);
  if (match === null) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}
