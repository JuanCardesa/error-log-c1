import { z } from 'zod';

import {
  CATEGORIES,
  CAUSES,
  CONFIDENCES,
  CORRECTORS,
  GENRES,
  MAX_PART,
  PAPERS,
  SESSION_KINDS,
  SESSION_STATUSES,
  SOURCES,
} from '../domain/enums';
import { isIsoDate } from '../time/dates';
import { withSessionFormat } from '../domain/session';

/**
 * Validacion de entrada. Los mismos invariantes viven tambien como CHECK en la base
 * (SPEC §2): aqui atrapan al usuario con un mensaje util, alli protegen el dato de
 * cualquier escritura que no pase por este camino.
 */

export const RULE_NOTE_MIN_LENGTH = 15;

const isoDate = z
  .string()
  .refine(isIsoDate, { message: 'Fecha invalida, se espera YYYY-MM-DD' });

const band = z.number().int().min(0).max(5).nullable();

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

export interface SessionSchemaOptions {
  /** Hoy, en `YYYY-MM-DD`. Se inyecta: aqui dentro no se lee el reloj. */
  readonly today: string;
}

export function sessionInputSchema(options: SessionSchemaOptions) {
  return z
    .object({
      date: isoDate,
      kind: z.enum(SESSION_KINDS),
      paper: z.enum(PAPERS).nullable(),
      part: z.number().int().positive().nullable(),
      source: z.enum(SOURCES),
      sourceRef: optionalText.default(null),
      itemsTotal: z.number().int().min(0).nullable().default(null),
      itemsCorrect: z.number().int().min(0).nullable().default(null),
      durationMin: z.number().int().min(0).nullable().default(null),
      timed: z.boolean().default(false),
      status: z.enum(SESSION_STATUSES).default('OPEN'),
    })
    .superRefine((value, ctx) => {
      if (value.date > options.today) {
        ctx.addIssue({
          code: 'custom',
          path: ['date'],
          message: 'La fecha no puede ser futura',
        });
      }

      if (value.paper === null && value.part !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['part'],
          message: 'Una sesion sin formato de examen no tiene part',
        });
      } else if (value.paper !== null) {
        const maxPart = MAX_PART[value.paper];
        if (value.part === null || value.part > maxPart) {
          ctx.addIssue({
            code: 'custom',
            path: ['part'],
            message: `${value.paper} requiere una part entre 1 y ${String(maxPart)}`,
          });
        }
      }

      // Implicacion, no bicondicional (decision P4): el Writing de un SIMULACRO es valido.
      if (value.kind === 'WRITING' && value.paper !== 'WRITING') {
        ctx.addIssue({
          code: 'custom',
          path: ['paper'],
          message: 'Una sesion de tipo WRITING tiene que ser del paper WRITING',
        });
      }

      // Solo el Writing puede no tener items: no se mide por aciertos.
      if (value.paper !== 'WRITING') {
        if (value.itemsTotal === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['itemsTotal'],
            message: 'Solo el paper WRITING puede quedarse sin items',
          });
        }
        if (value.itemsCorrect === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['itemsCorrect'],
            message: 'Solo el paper WRITING puede quedarse sin items',
          });
        }
      }

      if (
        value.itemsTotal !== null &&
        value.itemsCorrect !== null &&
        value.itemsCorrect > value.itemsTotal
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['itemsCorrect'],
          message: 'No puedes acertar mas items de los que intentaste',
        });
      }
    })
    .transform((value) => withSessionFormat(value));
}

export function errorInputSchema() {
  return z
    .object({
      sessionId: z.number().int().positive(),
      itemRef: optionalText.default(null),
      prompt: z.string().trim().min(1, 'El enunciado es obligatorio'),
      myAnswer: optionalText.default(null),
      correctAnswer: z.string().trim().min(1, 'La respuesta correcta es obligatoria'),
      cause: z.enum(CAUSES),
      category: z.enum(CATEGORIES),
      subcategory: optionalText.default(null),
      confidence: z.enum(CONFIDENCES),
      lateInSession: z.boolean().default(false),
      ruleNote: z
        .string()
        .trim()
        .min(
          RULE_NOTE_MIN_LENGTH,
          `La regla necesita al menos ${String(RULE_NOTE_MIN_LENGTH)} caracteres`,
        ),
      ankiAdded: z.boolean().default(false),
      ankiAddedAt: z.string().nullable().default(null),
      secs: z.number().int().min(0).nullable().default(null),
    })
    .superRefine((value, ctx) => {
      // El campo que hace el trabajo es la regla, no la solucion copiada.
      if (
        value.ruleNote.trim().toLowerCase() === value.correctAnswer.trim().toLowerCase()
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['ruleNote'],
          message: 'La regla no puede ser la respuesta correcta: escribela con tus palabras',
        });
      }
    });
}

export function writingPieceInputSchema(options: SessionSchemaOptions) {
  return z
    .object({
      sessionId: z.number().int().positive(),
      date: isoDate,
      genre: z.enum(GENRES),
      wordCount: z.number().int().min(0).nullable().default(null),
      minutes: z.number().int().min(0).nullable().default(null),
      timed: z.boolean().default(false),
      rewriteOf: z.number().int().positive().nullable().default(null),
      corrector: z.enum(CORRECTORS).nullable().default(null),
      bandContent: band.default(null),
      bandCommunicative: band.default(null),
      bandOrganisation: band.default(null),
      bandLanguage: band.default(null),
    })
    .superRefine((value, ctx) => {
      if (value.date > options.today) {
        ctx.addIssue({
          code: 'custom',
          path: ['date'],
          message: 'La fecha no puede ser futura',
        });
      }
    });
}

export type SessionInput = z.infer<ReturnType<typeof sessionInputSchema>>;
export type ErrorInput = z.infer<ReturnType<typeof errorInputSchema>>;
export type WritingPieceInput = z.infer<ReturnType<typeof writingPieceInputSchema>>;
