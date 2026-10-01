CREATE TABLE `notebook_annotation` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` integer NOT NULL,
	`kind` text NOT NULL,
	`color` text,
	`anchor` text NOT NULL,
	`orphaned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notebook_note`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notebook_annotation_style" CHECK(("notebook_annotation"."kind" = 'highlight' AND "notebook_annotation"."color" IS NULL)
    OR ("notebook_annotation"."kind" = 'color' AND "notebook_annotation"."color" IS NOT NULL AND "notebook_annotation"."color" IN ('green', 'red', 'blue', 'orange'))),
	CONSTRAINT "notebook_annotation_anchor" CHECK(CASE WHEN json_valid("notebook_annotation"."anchor") THEN
    json_type("notebook_annotation"."anchor", '$.start') = 'integer' AND json_extract("notebook_annotation"."anchor", '$.start') >= 0
    AND json_type("notebook_annotation"."anchor", '$.end') = 'integer' AND json_extract("notebook_annotation"."anchor", '$.end') > json_extract("notebook_annotation"."anchor", '$.start')
    AND json_type("notebook_annotation"."anchor", '$.exact') = 'text' AND length(json_extract("notebook_annotation"."anchor", '$.exact')) > 0
    ELSE 0 END)
);
--> statement-breakpoint
CREATE INDEX `notebook_annotation_note_idx` ON `notebook_annotation` (`note_id`);