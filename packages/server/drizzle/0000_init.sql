CREATE TABLE `links` (
	`source_id` text NOT NULL,
	`target` text NOT NULL,
	PRIMARY KEY(`source_id`, `target`),
	FOREIGN KEY (`source_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `links_target` ON `links` (`target`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`content` text,
	`hash` text,
	`mtime` real,
	`size` integer,
	`last_author` text,
	`last_save_at` integer,
	`pending_snapshot` integer DEFAULT false NOT NULL,
	`blame` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nodes_path_unique` ON `nodes` (`path`);--> statement-breakpoint
CREATE INDEX `nodes_hash` ON `nodes` (`hash`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`node_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`node_id`, `tag`),
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_tag` ON `tags` (`tag`);--> statement-breakpoint
CREATE TABLE `trash` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`original_path` text NOT NULL,
	`deleted_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`author` text NOT NULL,
	`file` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `versions_node` ON `versions` (`node_id`,`created_at`);