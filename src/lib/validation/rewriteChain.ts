/**
 * `rewrite_of` no puede apuntar a si misma ni formar ciclos (SPEC §2).
 *
 * Es una validacion de grafo, no de campo: hace falta el resto de textos para saber si
 * un enlace cierra un ciclo, asi que no cabe en un esquema de Zod. Se comprueba aqui,
 * antes de escribir.
 */

export interface RewriteLink {
  readonly id: number;
  readonly rewriteOf: number | null;
}

export type RewriteCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'self' | 'cycle' | 'missing'; readonly message: string };

const OK: RewriteCheck = { ok: true };

export function checkRewriteLink(
  pieces: readonly RewriteLink[],
  pieceId: number,
  rewriteOf: number | null,
): RewriteCheck {
  if (rewriteOf === null) return OK;

  if (rewriteOf === pieceId) {
    return { ok: false, reason: 'self', message: 'Un texto no puede reescribirse a si mismo' };
  }

  const byId = new Map(pieces.map((piece) => [piece.id, piece]));

  if (!byId.has(rewriteOf)) {
    return { ok: false, reason: 'missing', message: 'El texto original no existe' };
  }

  // Se sube por la cadena desde el original propuesto. Si se llega al texto que estamos
  // enlazando, el enlace cerraria un ciclo.
  const seen = new Set<number>([pieceId]);
  let cursor: number | null = rewriteOf;

  while (cursor !== null) {
    if (seen.has(cursor)) {
      return {
        ok: false,
        reason: 'cycle',
        message: 'Ese enlace crearia un ciclo de reescrituras',
      };
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.rewriteOf ?? null;
  }

  return OK;
}
