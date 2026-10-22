CREATE TABLE `bookmark_refs` (
	`node_id` text NOT NULL,
	`bookmark_id` text NOT NULL,
	PRIMARY KEY(`node_id`, `bookmark_id`),
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_refs_bookmark` ON `bookmark_refs` (`bookmark_id`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`url_key` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text,
	`position` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bookmarks_parent` ON `bookmarks` (`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `bookmarks_url_key` ON `bookmarks` (`url_key`);