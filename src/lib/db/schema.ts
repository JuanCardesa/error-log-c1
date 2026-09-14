import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

import {
  CATEGORIES,
  CAUSES,
  CONFIDENCES,
  CORRECTORS,
  GENRES,
  PAPERS,
  SESSION_KINDS,
  SESSION_STATUSES,
  SOURCES,
} from '../domain/enums';
import { RULE_NOTE_MIN_LENGTH } from '../validation/schemas';

/**
 * Schema de la base. Los CHECK repiten a proposito invariantes que ya valida Zod
 * (SPEC §2): Zod protege el formulario, esto protege el dato de cualquier escritura
 * que no pase por el formulario — una migracion, el seed, un `sqlite3` a mano.
 *
 * Lo unico que no se puede comprobar aqui es que la fecha no sea futura: SQLite no
 * admite funciones no deterministas como `date('now')` dentro de un CHECK. Ese
 * invariante vive solo en Zod.
 */

export const session = sqliteTable(
  'session',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    kind: text('kind', { enum: SESSION_KINDS }).notNull(),
    paper: text('paper', { enum: PAPERS }).notNull(),
    part: integer('part').notNull(),
    source: text('source', { enum: SOURCES }).notNull(),
    sourceRef: text('source_ref'),
    itemsTotal: integer('items_total'),
    itemsCorrect: integer('items_correct'),
    durationMin: integer('duration_min'),
    timed: integer('timed', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: SESSION_STATUSES }).notNull().default('OPEN'),
  },
  (table) => [
    index('session_date_idx').on(table.date),
    index('session_paper_part_idx').on(table.paper, table.part),

    check('session_items_non_negative', sql`
      (${table.itemsTotal} IS NULL OR ${table.itemsTotal} >= 0)
      AND (${table.itemsCorrect} IS NULL OR ${table.itemsCorrect} >= 0)
    `),
    check('session_items_correct_le_total', sql`
      ${table.itemsCorrect} IS NULL
      OR ${table.itemsTotal} IS NULL
      OR ${table.itemsCorrect} <= ${table.itemsTotal}
    `),
    // Solo el Writing puede quedarse sin items: no se mide por aciertos.
    check('session_items_required_outside_writing', sql`
      ${table.paper} = 'WRITING'
      OR (${table.itemsTotal} IS NOT NULL AND ${table.itemsCorrect} IS NOT NULL)
    `),
    check('session_part_within_paper', sql`
      ${table.part} >= 1 AND ${table.part} <= CASE ${table.paper}
        WHEN 'RUOE' THEN 8
        WHEN 'WRITING' THEN 2
        WHEN 'LISTENING' THEN 4
        WHEN 'SPEAKING' THEN 4
      END
    `),
    // Implicacion, no bicondicional (decision P4).
    check('session_writing_kind_implies_writing_paper', sql`
      ${table.kind} <> 'WRITING' OR ${table.paper} = 'WRITING'
    `),
  ],
);

export const errorRow = sqliteTable(
  'error_row',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    itemRef: text('item_ref'),
    prompt: text('prompt').notNull(),
    myAnswer: text('my_answer'),
    correctAnswer: text('correct_answer').notNull(),
    cause: text('cause', { enum: CAUSES }).notNull(),
    category: text('category', { enum: CATEGORIES }).notNull(),
    subcategory: text('subcategory'),
    confidence: text('confidence', { enum: CONFIDENCES }).notNull(),
    lateInSession: integer('late_in_session', { mode: 'boolean' }).notNull().default(false),
    ruleNote: text('rule_note').notNull(),
    ankiAdded: integer('anki_added', { mode: 'boolean' }).notNull().default(false),
    ankiAddedAt: text('anki_added_at'),
    secs: integer('secs'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    index('error_session_idx').on(table.sessionId),
    index('error_cause_idx').on(table.cause),
    index('error_category_idx').on(table.category),
    index('error_confidence_idx').on(table.confidence),

    check(
      'error_rule_note_min_length',
      sql`length(trim(${table.ruleNote})) >= ${sql.raw(String(RULE_NOTE_MIN_LENGTH))}`,
    ),
    // La regla es la regla, no la solucion copiada.
    check('error_rule_note_is_not_the_answer', sql`
      lower(trim(${table.ruleNote})) <> lower(trim(${table.correctAnswer}))
    `),
    check('error_secs_non_negative', sql`${table.secs} IS NULL OR ${table.secs} >= 0`),
    // Un error marcado como convertido tiene que decir cuando.
    check('error_anki_added_at_consistent', sql`
      (${table.ankiAdded} = 0 AND ${table.ankiAddedAt} IS NULL)
      OR (${table.ankiAdded} = 1 AND ${table.ankiAddedAt} IS NOT NULL)
    `),
  ],
);

export const writingPiece = sqliteTable(
  'writing_piece',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // UNIQUE (decision P1): una sesion tiene como mucho un texto, y por eso los errores
    // de la sesion son atribuibles a ese texto en Q6.
    sessionId: integer('session_id')
      .notNull()
      .unique()
      .references(() => session.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    genre: text('genre', { enum: GENRES }).notNull(),
    wordCount: integer('word_count'),
    minutes: integer('minutes'),
    timed: integer('timed', { mode: 'boolean' }).notNull().default(false),
    rewriteOf: integer('rewrite_of').references((): AnySQLiteColumn => writingPiece.id, {
      onDelete: 'set null',
    }),
    corrector: text('corrector', { enum: CORRECTORS }),
    bandContent: integer('band_content'),
    bandCommunicative: integer('band_communicative'),
    bandOrganisation: integer('band_organisation'),
    bandLanguage: integer('band_language'),
  },
  (table) => [
    index('writing_rewrite_of_idx').on(table.rewriteOf),

    // Un texto no puede reescribirse a si mismo. Los ciclos mas largos necesitan
    // recorrer el grafo y se comprueban en src/lib/validation/rewriteChain.ts.
    check('writing_no_self_rewrite', sql`
      ${table.rewriteOf} IS NULL OR ${table.rewriteOf} <> ${table.id}
    `),
    check('writing_bands_in_range', sql`
      (${table.bandContent} IS NULL OR ${table.bandContent} BETWEEN 0 AND 5)
      AND (${table.bandCommunicative} IS NULL OR ${table.bandCommunicative} BETWEEN 0 AND 5)
      AND (${table.bandOrganisation} IS NULL OR ${table.bandOrganisation} BETWEEN 0 AND 5)
      AND (${table.bandLanguage} IS NULL OR ${table.bandLanguage} BETWEEN 0 AND 5)
    `),
    check('writing_counts_non_negative', sql`
      (${table.wordCount} IS NULL OR ${table.wordCount} >= 0)
      AND (${table.minutes} IS NULL OR ${table.minutes} >= 0)
    `),
  ],
);
