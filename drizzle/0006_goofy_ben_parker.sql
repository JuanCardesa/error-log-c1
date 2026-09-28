CREATE TABLE `session_import_receipt` (
	`import_id` text PRIMARY KEY NOT NULL,
	`payload_hash` text NOT NULL,
	`session_id` integer NOT NULL,
	`created` integer NOT NULL,
	`skipped` integer NOT NULL
);
