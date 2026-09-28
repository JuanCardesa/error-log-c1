-- Trigram indexes preserve substring searches, including matches inside words.
-- The original instr() predicates remain as exact filters for SQLite's ASCII lower().
CREATE VIRTUAL TABLE `session_search_fts` USING fts5(`body`, tokenize = 'trigram');
--> statement-breakpoint
INSERT INTO `session_search_fts` (`rowid`, `body`)
SELECT `id`, lower(coalesce(`source_ref`, '') || ' ' || `date`) FROM `session`;
--> statement-breakpoint
CREATE TRIGGER `session_search_insert` AFTER INSERT ON `session` BEGIN
  INSERT INTO `session_search_fts` (`rowid`, `body`)
  VALUES (new.`id`, lower(coalesce(new.`source_ref`, '') || ' ' || new.`date`));
END;
--> statement-breakpoint
CREATE TRIGGER `session_search_update` AFTER UPDATE OF `source_ref`, `date` ON `session` BEGIN
  DELETE FROM `session_search_fts` WHERE `rowid` = old.`id`;
  INSERT INTO `session_search_fts` (`rowid`, `body`)
  VALUES (new.`id`, lower(coalesce(new.`source_ref`, '') || ' ' || new.`date`));
END;
--> statement-breakpoint
CREATE TRIGGER `session_search_delete` AFTER DELETE ON `session` BEGIN
  DELETE FROM `session_search_fts` WHERE `rowid` = old.`id`;
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE `error_search_fts` USING fts5(`body`, tokenize = 'trigram');
--> statement-breakpoint
INSERT INTO `error_search_fts` (`rowid`, `body`)
SELECT `id`, lower(`prompt` || ' ' || coalesce(`my_answer`, '') || ' ' || `correct_answer` || ' ' || `rule_note`)
FROM `error_row`;
--> statement-breakpoint
CREATE TRIGGER `error_search_insert` AFTER INSERT ON `error_row` BEGIN
  INSERT INTO `error_search_fts` (`rowid`, `body`)
  VALUES (new.`id`, lower(new.`prompt` || ' ' || coalesce(new.`my_answer`, '') || ' ' || new.`correct_answer` || ' ' || new.`rule_note`));
END;
--> statement-breakpoint
CREATE TRIGGER `error_search_update` AFTER UPDATE OF `prompt`, `my_answer`, `correct_answer`, `rule_note` ON `error_row` BEGIN
  DELETE FROM `error_search_fts` WHERE `rowid` = old.`id`;
  INSERT INTO `error_search_fts` (`rowid`, `body`)
  VALUES (new.`id`, lower(new.`prompt` || ' ' || coalesce(new.`my_answer`, '') || ' ' || new.`correct_answer` || ' ' || new.`rule_note`));
END;
--> statement-breakpoint
CREATE TRIGGER `error_search_delete` AFTER DELETE ON `error_row` BEGIN
  DELETE FROM `error_search_fts` WHERE `rowid` = old.`id`;
END;
