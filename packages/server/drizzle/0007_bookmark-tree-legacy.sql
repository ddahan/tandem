-- Bookmarks lose their folders (they go in notes now). The tree as it was is kept here, for the
-- vault to turn into page folders and an inbox note at start-up (`convertLegacyBookmarks`),
-- which then drops this table. Folders leave `bookmarks`; the next migration drops the columns.
CREATE TABLE `bookmark_tree_legacy` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`icon` text,
	`position` real NOT NULL
);
--> statement-breakpoint
INSERT INTO `bookmark_tree_legacy` (`id`, `kind`, `parent_id`, `title`, `icon`, `position`)
	SELECT `id`, `kind`, `parent_id`, `title`, `icon`, `position` FROM `bookmarks`;
--> statement-breakpoint
DELETE FROM `bookmarks` WHERE `kind` = 'folder';
