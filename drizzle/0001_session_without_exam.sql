-- Ejecutar con src/lib/db/migrate.ts: foreign_keys se desactiva ANTES del BEGIN.
-- Conservar tambien IDs historicos borrados para que AUTOINCREMENT no los reutilice.
CREATE TEMP TABLE `__session_sequence` (
  `seq` integer NOT NULL,
  `foreign_keys` integer NOT NULL CONSTRAINT session_migration_requires_foreign_keys_off CHECK (`foreign_keys` = 0)
);
--> statement-breakpoint
INSERT INTO `__session_sequence` SELECT coalesce((SELECT `seq` FROM sqlite_sequence WHERE `name` = 'session'), 0), foreign_keys FROM pragma_foreign_keys;
--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`paper` text,
	`part` integer,
	`source` text NOT NULL,
	`source_ref` text,
	`items_total` integer,
	`items_correct` integer,
	`duration_min` integer,
	`timed` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	CONSTRAINT "session_items_non_negative" CHECK(
      ("__new_session"."items_total" IS NULL OR "__new_session"."items_total" >= 0)
      AND ("__new_session"."items_correct" IS NULL OR "__new_session"."items_correct" >= 0)
    ),
	CONSTRAINT "session_items_correct_le_total" CHECK(
      "__new_session"."items_correct" IS NULL
      OR "__new_session"."items_total" IS NULL
      OR "__new_session"."items_correct" <= "__new_session"."items_total"
    ),
	CONSTRAINT "session_items_required_outside_writing" CHECK(
      "__new_session"."paper" IS 'WRITING'
      OR ("__new_session"."items_total" IS NOT NULL AND "__new_session"."items_correct" IS NOT NULL)
    ),
	CONSTRAINT "session_part_within_paper" CHECK(
      ("__new_session"."paper" IS NULL AND "__new_session"."part" IS NULL)
      OR (
        "__new_session"."paper" IS NOT NULL AND "__new_session"."part" IS NOT NULL
        AND typeof("__new_session"."part") = 'integer'
        AND "__new_session"."part" >= 1 AND "__new_session"."part" <= CASE "__new_session"."paper"
          WHEN 'RUOE' THEN 8
          WHEN 'WRITING' THEN 2
          WHEN 'LISTENING' THEN 4
          WHEN 'SPEAKING' THEN 4
          ELSE 0
        END
      )
    ),
	CONSTRAINT "session_writing_kind_implies_writing_paper" CHECK(
      "__new_session"."kind" <> 'WRITING' OR "__new_session"."paper" IS 'WRITING'
    )
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "date", "kind", "paper", "part", "source", "source_ref", "items_total", "items_correct", "duration_min", "timed", "status") SELECT "id", "date", "kind", "paper", "part", "source", "source_ref", "items_total", "items_correct", "duration_min", "timed", "status" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
UPDATE sqlite_sequence SET seq = max(seq, coalesce((SELECT seq FROM `__session_sequence`), 0)) WHERE name = 'session';
--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT 'session', seq FROM `__session_sequence` WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'session');
--> statement-breakpoint
DROP TABLE `__session_sequence`;
--> statement-breakpoint
CREATE INDEX `session_date_idx` ON `session` (`date`);--> statement-breakpoint
CREATE INDEX `session_paper_part_idx` ON `session` (`paper`,`part`);
