CREATE TABLE `database_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`position` real NOT NULL,
	`cells` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `databases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `database_rows_order` ON `database_rows` (`database_id`,`position`);--> statement-breakpoint
CREATE TABLE `databases` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`columns` text NOT NULL,
	`sort` text,
	`filters` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `databases_node` ON `databases` (`node_id`);