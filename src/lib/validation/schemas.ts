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
import type { Messages } from '../i18n';
import { isIsoDate } from '../time/dates';
import { withSessionFormat } from '../domain/session';

/**
 * Validacion de entrada. Los mismos invariantes viven tambien como CHECK en la base
 * (SPEC §2): aqui atrapan al usuario con un mensaje util, alli protegen el dato de
 * cualquier escritura que no pase por este camino.
 *
 * Los mensajes salen del diccionario `t`, en el idioma de quien rellena el formulario.
 * Los de Zod que no se redactan aquí llegan traducidos si se valida con `formErrors(t)`.
 */

export const RULE_NOTE_MIN_LENGTH = 15;

const isoDate = (t: Messages) => z
  .string()
  .refine(isIsoDate, { message: t.validation.invalidDate });

const band = z.number().int().min(0).max(5).nullable();

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

export interface SessionSchemaOptions {
  /** Hoy, en `YYYY-MM-DD`. Se inyecta: aqui dentro no se lee el reloj. */
  readonly today: string;
  /** Diccionario de la interfaz: los mensajes se escriben en su idioma. */
  readonly t: Messages;
}

export function sessionInputSchema(options: SessionSchemaOptions) {
  const { t } = options;
  return z
    .object({
      date: isoDate(t),
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
          message: t.validation.futureDate,
        });
      }

      if (value.paper === null && value.part !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['part'],
          message: t.validation.partWithoutPaper,
        });
      } else if (value.paper !== null) {
        const maxPart = MAX_PART[value.paper];
        if (value.part === null || value.part > maxPart) {
          ctx.addIssue({
            code: 'custom',
            path: ['part'],
            message: t.validation.partRange(value.paper, maxPart),
          });
        }
      }

      // Implicacion, no bicondicional (decision P4): el Writing de un SIMULACRO es valido.
      if (value.kind === 'WRITING' && value.paper !== 'WRITING') {
        ctx.addIssue({
          code: 'custom',
          path: ['paper'],
          message: t.validation.writingKindNeedsPaper,
        });
      }

      // Solo el Writing puede no tener items: no se mide por aciertos.
      if (value.paper !== 'WRITING') {
        if (value.itemsTotal === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['itemsTotal'],
            message: t.validation.itemsRequired,
          });
        }
        if (value.itemsCorrect === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['itemsCorrect'],
            message: t.validation.itemsRequired,
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
          message: t.validation.correctOverTotal,
        });
      }
    })
    .transform((value) => withSessionFormat(value));
}

const errorFields = (t: Messages) => z.object({
  sessionId: z.number().int().positive(),
  itemRef: optionalText.default(null),
  prompt: z.string().trim().min(1, t.validation.promptRequired),
  myAnswer: optionalText.default(null),
  correctAnswer: z.string().trim().min(1, t.validation.correctAnswerRequired),
  cause: z.enum(CAUSES),
  category: z.enum(CATEGORIES),
  subcategory: optionalText.default(null),
  confidence: z.enum(CONFIDENCES),
  lateInSession: z.boolean().default(false),
  ruleNote: z
    .string()
    .trim()
    .min(RULE_NOTE_MIN_LENGTH, t.validation.ruleMinLength(RULE_NOTE_MIN_LENGTH)),
});

/** El campo que hace el trabajo es la regla, no la solucion copiada. */
function ruleIsNotTheAnswer(t: Messages) {
  return (
    value: { readonly ruleNote: string; readonly correctAnswer: string },
    ctx: z.RefinementCtx,
  ): void => {
    if (value.ruleNote.trim().toLowerCase() !== value.correctAnswer.trim().toLowerCase()) return;
    ctx.addIssue({
      code: 'custom',
      path: ['ruleNote'],
      message: t.validation.ruleIsAnswer,
    });
  };
}

/**
 * Un error, tal y como se teclea o se pega. Lo usan el alta, la importacion y la
 * correccion: si las reglas divergieran, cada via guardaria una cosa distinta.
 *
 * Aqui no estan ni el estado de Anki —conversion, sello, vinculo y huella— ni el `secs`
 * que midieron las versiones anteriores, y no es un olvido. Toda escritura validada
 * entra por aqui y Zod descarta lo que no declara el esquema, asi que ningun formulario
 * ni tanda pegada puede sellar una conversion: eso solo lo hace crear la nota en Anki y
 * verificarla. Las acciones de servidor son POST publicos (docs de Next, «Server Actions
 * and Mutations»: manda una referencia y el cambio, y relee lo demas de una fuente de
 * confianza), de modo que un campo ausente tampoco puede significar «borralo».
 */
export function errorInputSchema(t: Messages) {
  return errorFields(t).superRefine(ruleIsNotTheAnswer(t));
}

export function writingPieceInputSchema(options: SessionSchemaOptions) {
  const { t } = options;
  return z
    .object({
      sessionId: z.number().int().positive(),
      date: isoDate(t),
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
          message: t.validation.futureDate,
        });
      }
    });
}

export type SessionInput = z.infer<ReturnType<typeof sessionInputSchema>>;
export type ErrorInput = z.infer<ReturnType<typeof errorInputSchema>>;
export type WritingPieceInput = z.infer<ReturnType<typeof writingPieceInputSchema>>;
