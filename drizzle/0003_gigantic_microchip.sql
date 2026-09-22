-- Ejecutar con src/lib/db/migrate.ts: foreign_keys se desactiva ANTES del BEGIN, y un
-- PRAGMA dentro de la transaccion del migrador no tendria efecto.
-- Drizzle emitio el SELECT leyendo `rollover_hour` de la tabla vieja, que no lo tiene:
-- la columna es nueva y entra como NULL hasta la primera sincronizacion.
CREATE TABLE `__new_anki_sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`profile` text NOT NULL,
	`url` text NOT NULL,
	`source_deck` text NOT NULL,
	`target_deck` text NOT NULL,
	`last_synced_at` text,
	`notes_seen` integer DEFAULT 0 NOT NULL,
	`rollover_hour` integer,
	CONSTRAINT "anki_sync_singleton" CHECK("__new_anki_sync"."id" = 1),
	CONSTRAINT "anki_sync_rollover" CHECK("__new_anki_sync"."rollover_hour" IS NULL OR "__new_anki_sync"."rollover_hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
INSERT INTO `__new_anki_sync`("id", "namespace", "profile", "url", "source_deck", "target_deck", "last_synced_at", "notes_seen", "rollover_hour") SELECT "id", "namespace", "profile", "url", "source_deck", "target_deck", "last_synced_at", "notes_seen", NULL FROM `anki_sync`;--> statement-breakpoint
DROP TABLE `anki_sync`;--> statement-breakpoint
ALTER TABLE `__new_anki_sync` RENAME TO `anki_sync`;
