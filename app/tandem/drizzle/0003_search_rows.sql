-- A fixed rowid per page in the search indexes: updates and lookups by page use it instead of
-- scanning the indexes (node_id is not indexed in FTS5 tables).
CREATE TABLE `search_rows` (
  `rowid` integer PRIMARY KEY,
  `node_id` text NOT NULL UNIQUE
);
--> statement-breakpoint
-- The indexes are rebuilt at startup (Vault.reindexAll), now with these rowids.
DELETE FROM `notes_fts`;
--> statement-breakpoint
DELETE FROM `notes_trigram`;
