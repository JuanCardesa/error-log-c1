import type { AnnotationFocus, AnnotationKind, Corrector } from '../domain/enums';
import type { WritingImport } from './contract';
import type {
  AnnotationOutcome,
  FieldChange,
  ImportDecision,
  PieceValues,
  PlanError,
  PlanWarning,
  Suggestion,
  WritingImportPlan,
} from './plan';

/**
 * Lo que la vista previa necesita del plan, en una forma que viaja al navegador: sin los
 * conjuntos internos ni la redacción guardada entera, y sin duplicar el texto.
 */

export interface AnnotationView {
  readonly index: number;
  readonly outcome: AnnotationOutcome;
  readonly kind: AnnotationKind;
  readonly focus: AnnotationFocus | null;
  readonly source: Corrector;
  readonly quote: string | null;
  readonly paragraph: number | null;
  /** Por qué no se colocó una cita. */
  readonly reason: 'notFound' | 'several' | 'contradicts' | null;
  /** Cuántas veces apareció, si fue más de una. */
  readonly candidates: number;
}

export interface WritingImportView {
  readonly digest: string;
  readonly decision: ImportDecision;
  readonly matchedBy: WritingImportPlan['matchedBy'];
  readonly target: { readonly uid: string; readonly title: string | null; readonly date: string } | null;
  readonly suggestions: readonly Suggestion[];
  /** El texto sobre el que se anclan las anotaciones: el guardado, si se actualiza uno con texto. */
  readonly text: string;
  readonly wordCount: number;
  /** Si el JSON no trae fecha de escritura, la vista previa la pregunta. */
  readonly writtenOnInJson: boolean;
  readonly values: Omit<PieceValues, 'originalText' | 'textFingerprint' | 'wordCount'>;
  readonly changes: readonly FieldChange[];
  readonly annotations: readonly AnnotationView[];
  readonly warnings: readonly PlanWarning[];
  readonly errors: readonly PlanError[];
  readonly nothingToDo: boolean;
}

export function toImportView(data: WritingImport, plan: WritingImportPlan, digest: string): WritingImportView {
  const { originalText: _text, textFingerprint: _fingerprint, wordCount, ...values } = plan.values;
  return {
    digest,
    decision: plan.decision,
    matchedBy: plan.matchedBy,
    target: plan.target === null ? null : { uid: plan.target.uid, title: plan.target.title, date: plan.target.date },
    suggestions: plan.suggestions,
    text: plan.text,
    wordCount: wordCount ?? 0,
    writtenOnInJson: data.writing.writtenOn !== null,
    values,
    // La transcripción completa no se repite en la lista: basta con saber que se añade.
    changes: plan.changes.map((change) => (change.field === 'originalText'
      ? { field: change.field, before: change.before !== null, after: change.after !== null }
      : change)),
    annotations: plan.annotations.map((item) => {
      const annotation = data.annotations[item.index];
      const { target } = annotation ?? { target: { scope: 'DOCUMENT' as const } };
      const location = item.location;
      return {
        index: item.index,
        outcome: item.outcome,
        kind: annotation?.kind ?? 'COMMENT',
        focus: annotation?.focus ?? null,
        source: annotation?.source ?? 'YO',
        quote: target.scope === 'SPAN' ? target.quote : null,
        paragraph: target.scope === 'DOCUMENT' ? null : target.paragraph,
        reason: location?.status === 'notFound' ? 'notFound' : location?.status === 'ambiguous' ? location.reason : null,
        candidates: location?.status === 'ambiguous' ? location.candidates.length : 0,
      };
    }),
    warnings: plan.warnings,
    errors: plan.errors,
    nothingToDo: plan.nothingToDo,
  };
}
