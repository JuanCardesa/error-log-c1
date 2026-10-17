import { createHash } from 'node:crypto';

import type { ImportedAnnotation } from './contract';

/**
 * Huellas para reconocer lo ya importado. Solo servidor: usa `node:crypto`.
 */

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Misma huella para dos transcripciones que solo difieren en mayúsculas, blancos, comillas
 * o guiones: es el mismo papel. El texto guardado no se toca; esto es solo para comparar.
 */
export function textFingerprint(text: string): string {
  return sha256(text.normalize('NFC').toLowerCase()
    .replace(/[’‘ʼ]/g, '\'').replace(/[“”]/g, '"').replace(/[–—‐‑]/g, '-')
    .replace(/\s+/g, ' ').trim());
}

/**
 * Identidad de una anotación importada: su id si viene de una exportación; si no, lo que
 * dice y dónde. Volver a importar el mismo JSON no la duplica. Las posiciones `start` y
 * `end` no entran: cambian si cambia la transcripción y la anotación sigue siendo la misma.
 */
export function annotationImportKey(annotation: ImportedAnnotation): string {
  if (annotation.id !== null) return `id:${annotation.id}`;
  const { target } = annotation;
  const place = target.scope === 'SPAN'
    ? [target.quote, target.paragraph, target.occurrence, target.before, target.after]
    : target.scope === 'PARAGRAPH' ? [target.paragraph] : [];
  return `hash:${sha256(JSON.stringify([annotation.kind, annotation.focus, annotation.source, target.scope, ...place,
    annotation.comment, annotation.suggestion]))}`;
}

/** Para recibos y comprobaciones de que nada cambió entre la vista previa y la confirmación. */
export function contentHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}
