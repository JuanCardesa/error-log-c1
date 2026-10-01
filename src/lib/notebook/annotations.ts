/** Offsets UTF-16 sobre el texto de estudio, nunca sobre el Markdown ni rutas del DOM. */
export interface StudyAnchor {
  readonly start: number;
  readonly end: number;
  readonly exact: string;
  readonly prefix: string;
  readonly suffix: string;
}

export const STUDY_COLORS = ['green', 'red', 'blue', 'orange'] as const;
export type StudyColor = typeof STUDY_COLORS[number];
export type StudyKind = 'highlight' | 'color';
export interface NotebookAnnotation {
  readonly id: string;
  readonly noteId: number;
  readonly kind: StudyKind;
  readonly color: StudyColor | null;
  readonly anchor: StudyAnchor;
  readonly orphaned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface StudyRange { readonly start: number; readonly end: number }
export type StudyCommand =
  | { readonly kind: 'highlight'; readonly enabled: boolean }
  | { readonly kind: 'color'; readonly color: StudyColor | null }
  | { readonly kind: 'clear' };

export function studyAnchor(text: string, start: number, end: number): StudyAnchor {
  return { start, end, exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48) };
}

/** Los offsets solo son autoridad mientras el contenido no ha cambiado. */
export function resolveStudyAnchor(text: string, anchor: StudyAnchor, previousText?: string): StudyAnchor | null {
  if (!anchor.exact) return null;
  if (previousText === text && text.slice(anchor.start, anchor.end) === anchor.exact) return studyAnchor(text, anchor.start, anchor.end);
  const matches: number[] = [];
  let at = text.indexOf(anchor.exact);
  while (at !== -1) {
    matches.push(at);
    at = text.indexOf(anchor.exact, at + 1);
  }
  // No convertir la otra aparición de una frase repetida en la marca que se acaba de borrar.
  const oldFirst = previousText?.indexOf(anchor.exact) ?? -1;
  const wasUnique = previousText !== undefined && oldFirst === anchor.start && previousText.indexOf(anchor.exact, oldFirst + 1) === -1;
  if (matches.length === 1 && wasUnique) return studyAnchor(text, matches[0]!, matches[0]! + anchor.exact.length);
  const matchesContext = (source: string, start: number) => (
    (anchor.prefix === '' ? start === 0 : source.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix)
    && (anchor.suffix === '' ? start + anchor.exact.length === source.length
      : source.slice(start + anchor.exact.length, start + anchor.exact.length + anchor.suffix.length) === anchor.suffix)
  );
  if (previousText !== undefined && !wasUnique) {
    let oldMatches = 0;
    for (let index = oldFirst; index !== -1; index = previousText.indexOf(anchor.exact, index + 1)) {
      if (matchesContext(previousText, index)) oldMatches += 1;
      if (oldMatches > 1) return null;
    }
  }
  const contextual = matches.filter((start) => matchesContext(text, start));
  return contextual.length === 1 ? studyAnchor(text, contextual[0]!, contextual[0]! + anchor.exact.length) : null;
}

/** Sustituye únicamente el atributo elegido y conserva las partes fuera de la selección. */
export function applyStudyCommand(
  annotations: readonly NotebookAnnotation[], text: string, range: StudyRange, command: StudyCommand,
  noteId: number, at: string, id: () => string,
): NotebookAnnotation[] {
  const next: NotebookAnnotation[] = [];
  for (const annotation of annotations) {
    const { start, end } = annotation.anchor;
    if (annotation.orphaned || (command.kind !== 'clear' && annotation.kind !== command.kind)
      || end <= range.start || start >= range.end) {
      next.push(annotation);
      continue;
    }
    if (start < range.start) next.push({ ...annotation, anchor: studyAnchor(text, start, range.start), updatedAt: at });
    if (end > range.end) next.push({ ...annotation, id: start < range.start ? id() : annotation.id,
      anchor: studyAnchor(text, range.end, end), updatedAt: at });
  }
  if (command.kind === 'highlight' && command.enabled || command.kind === 'color' && command.color !== null) {
    next.push({ id: id(), noteId, kind: command.kind, color: command.kind === 'color' ? command.color : null,
      anchor: studyAnchor(text, range.start, range.end), orphaned: false, createdAt: at, updatedAt: at });
  }
  return next;
}

export function isStudyHighlighted(annotations: readonly NotebookAnnotation[], range: StudyRange): boolean {
  let covered = range.start;
  const marks = annotations.filter((item) => !item.orphaned && item.kind === 'highlight')
    .sort((a, b) => a.anchor.start - b.anchor.start);
  for (const { anchor } of marks) {
    if (anchor.start > covered) break;
    if (anchor.end > covered) covered = anchor.end;
    if (covered >= range.end) return true;
  }
  return false;
}

export interface StudySegment extends StudyRange { readonly highlight: boolean; readonly color: StudyColor | null }

/** Barrido de intervalos una vez por cambio de marcas; cada nodo de texto consulta solo su tramo. */
export function studySegments(annotations: readonly NotebookAnnotation[]): StudySegment[] {
  const events = new Map<number, { start: NotebookAnnotation[]; end: NotebookAnnotation[] }>();
  for (const annotation of annotations) {
    if (annotation.orphaned) continue;
    for (const [position, kind] of [[annotation.anchor.start, 'start'], [annotation.anchor.end, 'end']] as const) {
      const event = events.get(position) ?? { start: [], end: [] };
      event[kind].push(annotation);
      events.set(position, event);
    }
  }
  const positions = [...events.keys()].sort((a, b) => a - b);
  const active = new Map<string, NotebookAnnotation>();
  const segments: StudySegment[] = [];
  for (let index = 0; index < positions.length - 1; index += 1) {
    const start = positions[index]!;
    const event = events.get(start)!;
    event.end.forEach((item) => active.delete(item.id));
    event.start.forEach((item) => active.set(item.id, item));
    if (active.size === 0) continue;
    const ordered = [...active.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
    segments.push({ start, end: positions[index + 1]!, highlight: ordered.some((item) => item.kind === 'highlight'),
      color: ordered.filter((item) => item.kind === 'color').at(-1)?.color ?? null });
  }
  return segments;
}
