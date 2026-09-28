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
    paper: text('paper', { enum: PAPERS }),
    part: integer('part'),
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
      ${table.paper} IS 'WRITING'
      OR (${table.itemsTotal} IS NOT NULL AND ${table.itemsCorrect} IS NOT NULL)
    `),
    check('session_part_within_paper', sql`
      (${table.paper} IS NULL AND ${table.part} IS NULL)
      OR (
        ${table.paper} IS NOT NULL AND ${table.part} IS NOT NULL
        AND typeof(${table.part}) = 'integer'
        AND ${table.part} >= 1 AND ${table.part} <= CASE ${table.paper}
          WHEN 'RUOE' THEN 8
          WHEN 'WRITING' THEN 2
          WHEN 'LISTENING' THEN 4
          WHEN 'SPEAKING' THEN 4
          ELSE 0
        END
      )
    `),
    // Implicacion, no bicondicional (decision P4).
    check('session_writing_kind_implies_writing_paper', sql`
      ${table.kind} <> 'WRITING' OR ${table.paper} IS 'WRITING'
    `),
  ],
);

/** Recibos permanentes: un reintento no recrea una tanda aunque se haya borrado la sesión. */
export const sessionImportReceipt = sqliteTable('session_import_receipt', {
  importId: text('import_id').primaryKey(),
  payloadHash: text('payload_hash').notNull(),
  sessionId: integer('session_id').notNull(),
  created: integer('created').notNull(),
  skipped: integer('skipped').notNull(),
});

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
    ankiNoteId: integer('anki_note_id').references((): AnySQLiteColumn => ankiNote.noteId, { onDelete: 'set null' }),
    /** Huella del contenido que se envio a Anki. Distinta de la actual = la tarjeta quedo vieja. */
    ankiContentHash: text('anki_content_hash'),
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

export const ankiNote = sqliteTable('anki_note', {
  noteId: integer('note_id').primaryKey(),
  model: text('model').notNull(),
  label: text('label').notNull(),
  tags: text('tags', { mode: 'json' }).$type<readonly string[]>().notNull(),
  category: text('category', { enum: CATEGORIES }),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
});

export const ankiCard = sqliteTable('anki_card', {
  cardId: integer('card_id').primaryKey(),
  noteId: integer('note_id').notNull().references(() => ankiNote.noteId, { onDelete: 'cascade' }),
  deck: text('deck').notNull(),
  templateOrd: integer('template_ord').notNull(),
  lapses: integer('lapses').notNull(),
  reps: integer('reps').notNull(),
  queue: integer('queue').notNull(),
  intervalDays: integer('interval_days').notNull(),
}, (table) => [index('anki_card_note_idx').on(table.noteId)]);

export const ankiReview = sqliteTable('anki_review', {
  reviewId: integer('review_id').primaryKey(),
  cardId: integer('card_id').notNull().references(() => ankiCard.cardId, { onDelete: 'cascade' }),
  reviewedAt: text('reviewed_at').notNull(),
  reviewDate: text('review_date').notNull(),
  ease: integer('ease').notNull(),
  interval: integer('interval').notNull(),
  lastInterval: integer('last_interval').notNull(),
  factor: integer('factor').notNull(),
  timeMs: integer('time_ms').notNull(),
  type: integer('type').notNull(),
}, (table) => [
  index('anki_review_date_idx').on(table.reviewDate),
  index('anki_review_card_idx').on(table.cardId),
  check('anki_review_answer', sql`${table.ease} BETWEEN 1 AND 4 AND ${table.type} BETWEEN 0 AND 3 AND ${table.timeMs} >= 0`),
]);

export const ankiSync = sqliteTable('anki_sync', {
  id: integer('id').primaryKey(),
  namespace: text('namespace').notNull(),
  profile: text('profile').notNull(),
  url: text('url').notNull(),
  sourceDeck: text('source_deck').notNull(),
  targetDeck: text('target_deck').notNull(),
  lastSyncedAt: text('last_synced_at'),
  notesSeen: integer('notes_seen').notNull().default(0),
  /** Hora a la que empieza el dia en Anki. Nullable: se sabe tras la primera sincronizacion. */
  rolloverHour: integer('rollover_hour'),
  /** De donde salio esa hora: declarada a mano o supuesta. Cambia lo que se afirma. */
  rolloverSource: text('rollover_source', { enum: ['config', 'default'] }),
}, (table) => [
  check('anki_sync_singleton', sql`${table.id} = 1`),
  check('anki_sync_rollover', sql`${table.rolloverHour} IS NULL OR ${table.rolloverHour} BETWEEN 0 AND 23`),
]);

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
