CREATE TABLE `error_row` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`item_ref` text,
	`prompt` text NOT NULL,
	`my_answer` text,
	`correct_answer` text NOT NULL,
	`cause` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`confidence` text NOT NULL,
	`late_in_session` integer DEFAULT false NOT NULL,
	`rule_note` text NOT NULL,
	`anki_added` integer DEFAULT false NOT NULL,
	`anki_added_at` text,
	`secs` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "error_rule_note_min_length" CHECK(length(trim("error_row"."rule_note")) >= 15),
	CONSTRAINT "error_rule_note_is_not_the_answer" CHECK(
      lower(trim("error_row"."rule_note")) <> lower(trim("error_row"."correct_answer"))
    ),
	CONSTRAINT "error_secs_non_negative" CHECK("error_row"."secs" IS NULL OR "error_row"."secs" >= 0),
	CONSTRAINT "error_anki_added_at_consistent" CHECK(
      ("error_row"."anki_added" = 0 AND "error_row"."anki_added_at" IS NULL)
      OR ("error_row"."anki_added" = 1 AND "error_row"."anki_added_at" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE INDEX `error_session_idx` ON `error_row` (`session_id`);--> statement-breakpoint
CREATE INDEX `error_cause_idx` ON `error_row` (`cause`);--> statement-breakpoint
CREATE INDEX `error_category_idx` ON `error_row` (`category`);--> statement-breakpoint
CREATE INDEX `error_confidence_idx` ON `error_row` (`confidence`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`paper` text NOT NULL,
	`part` integer NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`items_total` integer,
	`items_correct` integer,
	`duration_min` integer,
	`timed` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	CONSTRAINT "session_items_non_negative" CHECK(
      ("session"."items_total" IS NULL OR "session"."items_total" >= 0)
      AND ("session"."items_correct" IS NULL OR "session"."items_correct" >= 0)
    ),
	CONSTRAINT "session_items_correct_le_total" CHECK(
      "session"."items_correct" IS NULL
      OR "session"."items_total" IS NULL
      OR "session"."items_correct" <= "session"."items_total"
    ),
	CONSTRAINT "session_items_required_outside_writing" CHECK(
      "session"."paper" = 'WRITING'
      OR ("session"."items_total" IS NOT NULL AND "session"."items_correct" IS NOT NULL)
    ),
	CONSTRAINT "session_part_within_paper" CHECK(
      "session"."part" >= 1 AND "session"."part" <= CASE "session"."paper"
        WHEN 'RUOE' THEN 8
        WHEN 'WRITING' THEN 2
        WHEN 'LISTENING' THEN 4
        WHEN 'SPEAKING' THEN 4
      END
    ),
	CONSTRAINT "session_writing_kind_implies_writing_paper" CHECK(
      "session"."kind" <> 'WRITING' OR "session"."paper" = 'WRITING'
    )
);
--> statement-breakpoint
CREATE INDEX `session_date_idx` ON `session` (`date`);--> statement-breakpoint
CREATE INDEX `session_paper_part_idx` ON `session` (`paper`,`part`);--> statement-breakpoint
CREATE TABLE `writing_piece` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`date` text NOT NULL,
	`genre` text NOT NULL,
	`word_count` integer,
	`minutes` integer,
	`timed` integer DEFAULT false NOT NULL,
	`rewrite_of` integer,
	`corrector` text,
	`band_content` integer,
	`band_communicative` integer,
	`band_organisation` integer,
	`band_language` integer,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rewrite_of`) REFERENCES `writing_piece`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "writing_no_self_rewrite" CHECK(
      "writing_piece"."rewrite_of" IS NULL OR "writing_piece"."rewrite_of" <> "writing_piece"."id"
    ),
	CONSTRAINT "writing_bands_in_range" CHECK(
      ("writing_piece"."band_content" IS NULL OR "writing_piece"."band_content" BETWEEN 0 AND 5)
      AND ("writing_piece"."band_communicative" IS NULL OR "writing_piece"."band_communicative" BETWEEN 0 AND 5)
      AND ("writing_piece"."band_organisation" IS NULL OR "writing_piece"."band_organisation" BETWEEN 0 AND 5)
      AND ("writing_piece"."band_language" IS NULL OR "writing_piece"."band_language" BETWEEN 0 AND 5)
    ),
	CONSTRAINT "writing_counts_non_negative" CHECK(
      ("writing_piece"."word_count" IS NULL OR "writing_piece"."word_count" >= 0)
      AND ("writing_piece"."minutes" IS NULL OR "writing_piece"."minutes" >= 0)
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_piece_session_id_unique` ON `writing_piece` (`session_id`);--> statement-breakpoint
CREATE INDEX `writing_rewrite_of_idx` ON `writing_piece` (`rewrite_of`);