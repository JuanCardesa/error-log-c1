CREATE TABLE `notebook_error_link` (
	`error_id` integer NOT NULL,
	`note_id` integer NOT NULL,
	`heading_slug` text,
	`heading_text` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`error_id`, `note_id`),
	FOREIGN KEY (`error_id`) REFERENCES `error_row`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notebook_note`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notebook_error_link_heading_pair" CHECK(("notebook_error_link"."heading_slug" IS NULL AND "notebook_error_link"."heading_text" IS NULL) OR ("notebook_error_link"."heading_slug" IS NOT NULL AND "notebook_error_link"."heading_text" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `notebook_error_link_note_error_idx` ON `notebook_error_link` (`note_id`,`error_id`);--> statement-breakpoint
CREATE TABLE `notebook_folder` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `notebook_folder`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notebook_folder_no_self_parent" CHECK("notebook_folder"."parent_id" IS NULL OR "notebook_folder"."parent_id" <> "notebook_folder"."id"),
	CONSTRAINT "notebook_folder_name_length" CHECK(length(trim("notebook_folder"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "notebook_folder_name_key_length" CHECK(length("notebook_folder"."name_key") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE INDEX `notebook_folder_parent_idx` ON `notebook_folder` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_folder_root_name_key_unique` ON `notebook_folder` (`name_key`) WHERE "notebook_folder"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_folder_child_name_key_unique` ON `notebook_folder` (`parent_id`,`name_key`) WHERE "notebook_folder"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `notebook_note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text NOT NULL,
	`folder_id` integer,
	`title` text NOT NULL,
	`content_markdown` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `notebook_folder`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notebook_note_title_length" CHECK(length(trim("notebook_note"."title")) BETWEEN 1 AND 160),
	CONSTRAINT "notebook_note_content_size" CHECK(length(CAST("notebook_note"."content_markdown" AS BLOB)) <= 262144),
	CONSTRAINT "notebook_note_tags_array" CHECK(CASE WHEN json_valid("notebook_note"."tags") THEN json_type("notebook_note"."tags") = 'array' AND json_array_length("notebook_note"."tags") <= 12 ELSE 0 END),
	CONSTRAINT "notebook_note_revision_positive" CHECK("notebook_note"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_note_uid_unique` ON `notebook_note` (`uid`);--> statement-breakpoint
CREATE INDEX `notebook_note_folder_title_id_idx` ON `notebook_note` (`folder_id`,`title`,`id`);--> statement-breakpoint
CREATE INDEX `notebook_note_updated_id_idx` ON `notebook_note` (`updated_at`,`id`);--> statement-breakpoint
CREATE TRIGGER notebook_folder_insert_depth
BEFORE INSERT ON notebook_folder
WHEN NEW.parent_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM notebook_folder AS parent
  WHERE parent.id = NEW.parent_id AND parent.parent_id IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'notebook_folder_depth');
END;--> statement-breakpoint
CREATE TRIGGER notebook_folder_update_depth
BEFORE UPDATE OF parent_id ON notebook_folder
WHEN NEW.parent_id IS NOT NULL AND (
  EXISTS (
    SELECT 1 FROM notebook_folder AS parent
    WHERE parent.id = NEW.parent_id AND parent.parent_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM notebook_folder AS child WHERE child.parent_id = OLD.id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'notebook_folder_depth');
END;
