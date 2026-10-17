-- Full-text index of pages (maintained by the server, not by triggers: the text comes from the
-- files). Accents are ignored; prefix indexes make search-as-you-type fast.
CREATE VIRTUAL TABLE `notes_fts` USING fts5(
  node_id UNINDEXED,
  title,
  body,
  attachments,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
--> statement-breakpoint
-- Every indexed word with its frequency, for typo tolerance ("did you mean").
CREATE VIRTUAL TABLE `notes_fts_vocab` USING fts5vocab(`notes_fts`, 'row');
--> statement-breakpoint
-- Same text, indexed by trigrams: finds words inside words (`base` in `database`), as a
-- fallback when the word index finds too little.
CREATE VIRTUAL TABLE `notes_trigram` USING fts5(
  node_id UNINDEXED,
  title,
  body,
  attachments,
  tokenize = 'trigram remove_diacritics 1'
);
