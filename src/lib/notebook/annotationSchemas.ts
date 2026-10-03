import { z } from 'zod';
import { STUDY_COLORS } from './annotations';

export const studyCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('highlight'), enabled: z.boolean() }),
  z.object({ kind: z.literal('color'), color: z.enum(STUDY_COLORS).nullable() }),
  z.object({ kind: z.literal('clear') }),
]);
export const saveStudyAnnotationSchema = z.object({
  noteId: z.number().int().positive(), uid: z.uuid(), expectedRevision: z.number().int().positive(),
  anchor: z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(),
    exact: z.string().min(1).max(262144), prefix: z.string().max(48), suffix: z.string().max(48) }),
  command: studyCommandSchema,
});
export type SaveStudyAnnotationInput = z.infer<typeof saveStudyAnnotationSchema>;
