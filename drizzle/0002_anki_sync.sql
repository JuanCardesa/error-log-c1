CREATE TABLE `anki_card` (
	`card_id` integer PRIMARY KEY NOT NULL,
	`note_id` integer NOT NULL,
	`deck` text NOT NULL,
	`template_ord` integer NOT NULL,
	`lapses` integer NOT NULL,
	`reps` integer NOT NULL,
	`queue` integer NOT NULL,
	`interval_days` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `anki_note`(`note_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `anki_card_note_idx` ON `anki_card` (`note_id`);--> statement-breakpoint
CREATE TABLE `anki_note` (
	`note_id` integer PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`label` text NOT NULL,
	`tags` text NOT NULL,
	`category` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `anki_review` (
	`review_id` integer PRIMARY KEY NOT NULL,
	`card_id` integer NOT NULL,
	`reviewed_at` text NOT NULL,
	`review_date` text NOT NULL,
	`ease` integer NOT NULL,
	`interval` integer NOT NULL,
	`last_interval` integer NOT NULL,
	`factor` integer NOT NULL,
	`time_ms` integer NOT NULL,
	`type` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `anki_card`(`card_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "anki_review_answer" CHECK("anki_review"."ease" BETWEEN 1 AND 4 AND "anki_review"."type" BETWEEN 0 AND 3 AND "anki_review"."time_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX `anki_review_date_idx` ON `anki_review` (`review_date`);--> statement-breakpoint
CREATE INDEX `anki_review_card_idx` ON `anki_review` (`card_id`);--> statement-breakpoint
CREATE TABLE `anki_sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`profile` text NOT NULL,
	`url` text NOT NULL,
	`source_deck` text NOT NULL,
	`target_deck` text NOT NULL,
	`last_synced_at` text,
	`notes_seen` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "anki_sync_singleton" CHECK("anki_sync"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE `error_row` ADD `anki_note_id` integer REFERENCES anki_note(note_id) ON DELETE SET NULL;
