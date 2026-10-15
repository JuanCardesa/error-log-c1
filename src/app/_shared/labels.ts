import { CAUSE_META, type Cause } from '@/lib/domain/enums';
import type { Messages } from '@/lib/i18n';

/**
 * Etiquetas de interfaz para los valores de las taxonomias. Los textos viven en el
 * diccionario (`t.labels`); aqui quedan las reglas para elegirlos.
 *
 * Solo cambian lo que se lee en pantalla: el `value` de cada control, lo que se guarda y
 * lo que se exporta siguen siendo el enum tal cual (SPEC §3).
 */

/**
 * Estado de un error frente a Anki, tal como se lee en las listas. «No aplica» no es
 * «Pendiente»: su causa no genera tarjeta.
 */
export type AnkiState = 'PENDING' | 'CONVERTED' | 'LEGACY' | 'NOT_APPLICABLE';

export function ankiState(error: {
  readonly cause: Cause;
  readonly ankiAdded: boolean;
  readonly ankiNoteId: number | null;
}): AnkiState {
  if (!CAUSE_META[error.cause].generatesCard) return 'NOT_APPLICABLE';
  if (!error.ankiAdded) return 'PENDING';
  return error.ankiNoteId === null ? 'LEGACY' : 'CONVERTED';
}

/**
 * Etiqueta de una categoria que podria no ser del enum (una fila editada a mano, un
 * espejo de Anki antiguo). Dice que no se reconoce y cual llego: con el codigo solo,
 * parecia una etiqueta; con un texto generico, dos desconocidas serian indistinguibles.
 */
export function categoryLabel(value: string, t: Messages): string {
  return (t.labels.category as Readonly<Record<string, string | undefined>>)[value]
    ?? t.labels.unknownCategory(value);
}

/**
 * Que mide cada regla, dicho para leerlo. El motor nombra sus señales por la variable que
 * calcula (`pct_convertidos (Q5)`); la interfaz las cuenta en palabras.
 */
export function ruleSignalLabel(id: number, t: Messages): string | undefined {
  return (t.labels.ruleSignal as Readonly<Record<number, string | undefined>>)[id];
}

/**
 * La recomendación de cada regla, dicha como instrucción breve. No cambia su significado,
 * su prioridad ni sus condiciones: solo el tono con el que se lee en Progreso.
 */
export function ruleRecommendationLabel(id: number, t: Messages): string | undefined {
  return (t.labels.ruleRecommendation as Readonly<Record<number, string | undefined>>)[id];
}
