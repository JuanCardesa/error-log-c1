-- Índice derivado. El contenido visible se calcula desde el AST en notebookRepo.
CREATE VIRTUAL TABLE `notebook_note_fts` USING fts5(
  `title`, `body`, `tags`, tokenize = 'trigram'
);
--> statement-breakpoint
CREATE TRIGGER `notebook_note_fts_delete` AFTER DELETE ON `notebook_note` BEGIN
  DELETE FROM `notebook_note_fts` WHERE `rowid` = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `notebook_note_fts_update` AFTER UPDATE OF `title`, `content_markdown`, `tags`
ON `notebook_note` BEGIN
  DELETE FROM `notebook_note_fts` WHERE `rowid` = old.`id`;
END;
