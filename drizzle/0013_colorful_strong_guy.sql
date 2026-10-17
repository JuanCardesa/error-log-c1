CREATE TABLE `writing_text_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`piece_id` integer NOT NULL,
	`text` text NOT NULL,
	`text_revision` integer NOT NULL,
	`replaced_at` text NOT NULL,
	FOREIGN KEY (`piece_id`) REFERENCES `writing_piece`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "writing_text_history_revision_positive" CHECK("writing_text_history"."text_revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_text_history_piece_revision_unique` ON `writing_text_history` (`piece_id`,`text_revision`);