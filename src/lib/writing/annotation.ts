import { z } from 'zod';

import { ANNOTATION_FOCUSES, ANNOTATION_KINDS, CORRECTORS } from '../domain/enums';
import { WRITING_LIMITS } from './limits';

const note = z.string().trim().min(1).max(WRITING_LIMITS.annotationNote).nullable();
const content = z.strictObject({
  kind: z.enum(ANNOTATION_KINDS),
  focus: z.enum(ANNOTATION_FOCUSES).nullable(),
  source: z.enum(CORRECTORS),
  comment: note,
  suggestion: note,
}).refine((value) => value.comment !== null || value.suggestion !== null
  || (value.kind === 'STRENGTH' && value.focus !== null), { message: 'content' });

export const createWritingAnnotationSchema = z.discriminatedUnion('scope', [
  content.extend({ pieceId: z.number().int().positive(), scope: z.literal('DOCUMENT') }),
  content.extend({ pieceId: z.number().int().positive(), scope: z.literal('PARAGRAPH'), paragraph: z.number().int().positive() }),
  content.extend({ pieceId: z.number().int().positive(), scope: z.literal('SPAN'), start: z.number().int().nonnegative(), end: z.number().int().positive() }),
]);

export const updateWritingAnnotationSchema = content.extend({ id: z.uuid() });
export const placeWritingAnnotationSchema = z.strictObject({ id: z.uuid(), start: z.number().int().nonnegative(), end: z.number().int().positive() });
export const writingAnnotationIdSchema = z.uuid();

export type CreateWritingAnnotation = z.infer<typeof createWritingAnnotationSchema>;
export type UpdateWritingAnnotation = z.infer<typeof updateWritingAnnotationSchema>;
export type PlaceWritingAnnotation = z.infer<typeof placeWritingAnnotationSchema>;
