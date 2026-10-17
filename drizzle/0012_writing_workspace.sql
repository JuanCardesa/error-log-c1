-- Ejecutar con src/lib/db/migrate.ts: foreign_keys se desactiva ANTES del BEGIN. Con ellas
-- activas, DROP TABLE borraria fila a fila y pondria a NULL el rewrite_of ya copiado.
-- Conservar tambien IDs historicos borrados para que AUTOINCREMENT no los reutilice.
CREATE TEMP TABLE `__writing_piece_sequence` (
  `seq` integer NOT NULL,
  `foreign_keys` integer NOT NULL CONSTRAINT writing_piece_migration_requires_foreign_keys_off CHECK (`foreign_keys` = 0)
);
--> statement-breakpoint
INSERT INTO `__writing_piece_sequence` SELECT coalesce((SELECT `seq` FROM sqlite_sequence WHERE `name` = 'writing_piece'), 0), foreign_keys FROM pragma_foreign_keys;
--> statement-breakpoint
CREATE TABLE `__new_writing_piece` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`date` text NOT NULL,
	`genre` text NOT NULL,
	`word_count` integer,
	`minutes` integer,
	`timed` integer DEFAULT false NOT NULL,
	`rewrite_of` integer,
	`corrector` text,
	`band_content` real,
	`band_communicative` real,
	`band_organisation` real,
	`band_language` real,
	`uid` text DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4'
  || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1)
  || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`title` text,
	`task_prompt` text,
	`original_text` text,
	`text_fingerprint` text,
	`text_revision` integer DEFAULT 1 NOT NULL,
	`date_basis` text DEFAULT 'WRITTEN' NOT NULL,
	`corrected_on` text,
	`status` text DEFAULT 'AWAITING' NOT NULL,
	`teacher_comment` text,
	`personal_notes` text,
	`word_min` integer,
	`word_max` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rewrite_of`) REFERENCES `writing_piece`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "writing_no_self_rewrite" CHECK(
      "__new_writing_piece"."rewrite_of" IS NULL OR "__new_writing_piece"."rewrite_of" <> "__new_writing_piece"."id"
    ),
	CONSTRAINT "writing_bands_in_range" CHECK(
      ("__new_writing_piece"."band_content" IS NULL OR "__new_writing_piece"."band_content" BETWEEN 0 AND 5)
      AND ("__new_writing_piece"."band_communicative" IS NULL OR "__new_writing_piece"."band_communicative" BETWEEN 0 AND 5)
      AND ("__new_writing_piece"."band_organisation" IS NULL OR "__new_writing_piece"."band_organisation" BETWEEN 0 AND 5)
      AND ("__new_writing_piece"."band_language" IS NULL OR "__new_writing_piece"."band_language" BETWEEN 0 AND 5)
    ),
	CONSTRAINT "writing_bands_half_points" CHECK(
      ("__new_writing_piece"."band_content" IS NULL OR "__new_writing_piece"."band_content" * 2 = CAST("__new_writing_piece"."band_content" * 2 AS INTEGER))
      AND ("__new_writing_piece"."band_communicative" IS NULL OR "__new_writing_piece"."band_communicative" * 2 = CAST("__new_writing_piece"."band_communicative" * 2 AS INTEGER))
      AND ("__new_writing_piece"."band_organisation" IS NULL OR "__new_writing_piece"."band_organisation" * 2 = CAST("__new_writing_piece"."band_organisation" * 2 AS INTEGER))
      AND ("__new_writing_piece"."band_language" IS NULL OR "__new_writing_piece"."band_language" * 2 = CAST("__new_writing_piece"."band_language" * 2 AS INTEGER))
    ),
	CONSTRAINT "writing_counts_non_negative" CHECK(
      ("__new_writing_piece"."word_count" IS NULL OR "__new_writing_piece"."word_count" >= 0)
      AND ("__new_writing_piece"."minutes" IS NULL OR "__new_writing_piece"."minutes" >= 0)
    ),
	CONSTRAINT "writing_texts_length" CHECK(
      ("__new_writing_piece"."title" IS NULL OR length(trim("__new_writing_piece"."title")) BETWEEN 1 AND 200)
      AND ("__new_writing_piece"."task_prompt" IS NULL OR length(trim("__new_writing_piece"."task_prompt")) BETWEEN 1 AND 5000)
      AND ("__new_writing_piece"."original_text" IS NULL OR (length(trim("__new_writing_piece"."original_text")) >= 1 AND length("__new_writing_piece"."original_text") <= 20000))
      AND ("__new_writing_piece"."teacher_comment" IS NULL OR length(trim("__new_writing_piece"."teacher_comment")) BETWEEN 1 AND 5000)
      AND ("__new_writing_piece"."personal_notes" IS NULL OR length(trim("__new_writing_piece"."personal_notes")) BETWEEN 1 AND 5000)
    ),
	CONSTRAINT "writing_fingerprint_follows_text" CHECK(
      ("__new_writing_piece"."original_text" IS NULL) = ("__new_writing_piece"."text_fingerprint" IS NULL)
    ),
	CONSTRAINT "writing_text_revision_positive" CHECK("__new_writing_piece"."text_revision" >= 1),
	CONSTRAINT "writing_status" CHECK("__new_writing_piece"."status" IN ('AWAITING', 'CORRECTED', 'NOT_SUBMITTED')),
	CONSTRAINT "writing_date_basis" CHECK("__new_writing_piece"."date_basis" IN ('WRITTEN', 'CORRECTED', 'IMPORTED')),
	CONSTRAINT "writing_corrected_after_written" CHECK(
      "__new_writing_piece"."corrected_on" IS NULL OR "__new_writing_piece"."corrected_on" >= "__new_writing_piece"."date"
    ),
	CONSTRAINT "writing_word_range" CHECK(
      ("__new_writing_piece"."word_min" IS NULL AND "__new_writing_piece"."word_max" IS NULL)
      OR (
        "__new_writing_piece"."word_min" IS NOT NULL AND "__new_writing_piece"."word_max" IS NOT NULL
        AND "__new_writing_piece"."word_min" >= 1 AND "__new_writing_piece"."word_min" <= "__new_writing_piece"."word_max"
        AND "__new_writing_piece"."word_max" <= 2000
      )
    )
);
--> statement-breakpoint
-- Los textos anteriores no tienen transcripcion ni fecha de alta: el uid lo pone el DEFAULT,
-- el alta es la medianoche de su fecha y el estado sale de si tenian evaluacion.
INSERT INTO `__new_writing_piece`("id", "session_id", "date", "genre", "word_count", "minutes", "timed", "rewrite_of", "corrector", "band_content", "band_communicative", "band_organisation", "band_language", "status", "created_at", "updated_at")
SELECT "id", "session_id", "date", "genre", "word_count", "minutes", "timed", "rewrite_of", "corrector", "band_content", "band_communicative", "band_organisation", "band_language",
  CASE WHEN "corrector" IS NOT NULL OR "band_content" IS NOT NULL OR "band_communicative" IS NOT NULL OR "band_organisation" IS NOT NULL OR "band_language" IS NOT NULL THEN 'CORRECTED' ELSE 'AWAITING' END,
  "date" || 'T00:00:00.000Z', "date" || 'T00:00:00.000Z'
FROM `writing_piece`;
--> statement-breakpoint
DROP TABLE `writing_piece`;
--> statement-breakpoint
ALTER TABLE `__new_writing_piece` RENAME TO `writing_piece`;
--> statement-breakpoint
UPDATE sqlite_sequence SET seq = max(seq, coalesce((SELECT seq FROM `__writing_piece_sequence`), 0)) WHERE name = 'writing_piece';
--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT 'writing_piece', seq FROM `__writing_piece_sequence` WHERE seq > 0 AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'writing_piece');
--> statement-breakpoint
DROP TABLE `__writing_piece_sequence`;
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_piece_session_id_unique` ON `writing_piece` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_piece_uid_unique` ON `writing_piece` (`uid`);
--> statement-breakpoint
CREATE INDEX `writing_rewrite_of_idx` ON `writing_piece` (`rewrite_of`);
--> statement-breakpoint
CREATE INDEX `writing_text_fingerprint_idx` ON `writing_piece` (`text_fingerprint`);
--> statement-breakpoint
CREATE TABLE `writing_annotation` (
	`id` text PRIMARY KEY NOT NULL,
	`piece_id` integer NOT NULL,
	`kind` text NOT NULL,
	`focus` text,
	`source` text NOT NULL,
	`scope` text NOT NULL,
	`anchor` text,
	`paragraph` integer,
	`quote` text,
	`comment` text,
	`suggestion` text,
	`reviewed_at` text,
	`import_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`piece_id`) REFERENCES `writing_piece`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "writing_annotation_enums" CHECK(
    "writing_annotation"."kind" IN ('ERROR', 'IMPROVEMENT', 'STRENGTH', 'COMMENT')
    AND ("writing_annotation"."focus" IS NULL OR "writing_annotation"."focus" IN ('GRAMMAR', 'SPELLING', 'PUNCTUATION', 'WORD_ORDER', 'VOCABULARY', 'COLLOCATION', 'REGISTER', 'CLARITY', 'LINKING', 'ORGANISATION', 'CONTENT', 'OTHER'))
    AND "writing_annotation"."source" IN ('PROFESOR', 'YO', 'IA')
    AND "writing_annotation"."scope" IN ('SPAN', 'PARAGRAPH', 'DOCUMENT')
  ),
	CONSTRAINT "writing_annotation_target" CHECK(
    ("writing_annotation"."scope" = 'DOCUMENT' AND "writing_annotation"."anchor" IS NULL AND "writing_annotation"."paragraph" IS NULL AND "writing_annotation"."quote" IS NULL)
    OR ("writing_annotation"."scope" = 'PARAGRAPH' AND "writing_annotation"."anchor" IS NULL AND "writing_annotation"."paragraph" IS NOT NULL AND "writing_annotation"."quote" IS NULL)
    OR ("writing_annotation"."scope" = 'SPAN' AND ("writing_annotation"."anchor" IS NOT NULL OR "writing_annotation"."quote" IS NOT NULL))
  ),
	CONSTRAINT "writing_annotation_paragraph" CHECK(
    "writing_annotation"."paragraph" IS NULL OR (typeof("writing_annotation"."paragraph") = 'integer' AND "writing_annotation"."paragraph" >= 1)
  ),
	CONSTRAINT "writing_annotation_has_content" CHECK(
    "writing_annotation"."comment" IS NOT NULL OR "writing_annotation"."suggestion" IS NOT NULL
    OR ("writing_annotation"."kind" = 'STRENGTH' AND "writing_annotation"."focus" IS NOT NULL)
  ),
	CONSTRAINT "writing_annotation_lengths" CHECK(
    ("writing_annotation"."comment" IS NULL OR length(trim("writing_annotation"."comment")) BETWEEN 1 AND 2000)
    AND ("writing_annotation"."suggestion" IS NULL OR length(trim("writing_annotation"."suggestion")) BETWEEN 1 AND 2000)
    AND ("writing_annotation"."quote" IS NULL OR length("writing_annotation"."quote") BETWEEN 1 AND 20000)
  ),
	CONSTRAINT "writing_annotation_anchor" CHECK("writing_annotation"."anchor" IS NULL OR (CASE WHEN json_valid("writing_annotation"."anchor") THEN
    json_type("writing_annotation"."anchor", '$.start') = 'integer' AND json_extract("writing_annotation"."anchor", '$.start') >= 0
    AND json_type("writing_annotation"."anchor", '$.end') = 'integer' AND json_extract("writing_annotation"."anchor", '$.end') > json_extract("writing_annotation"."anchor", '$.start')
    AND json_type("writing_annotation"."anchor", '$.exact') = 'text' AND length(json_extract("writing_annotation"."anchor", '$.exact')) > 0
    ELSE 0 END))
);
--> statement-breakpoint
CREATE INDEX `writing_annotation_piece_idx` ON `writing_annotation` (`piece_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_annotation_import_key_unique` ON `writing_annotation` (`piece_id`,`import_key`) WHERE "writing_annotation"."import_key" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `writing_import_receipt` (
	`import_id` text PRIMARY KEY NOT NULL,
	`payload_hash` text NOT NULL,
	`piece_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
