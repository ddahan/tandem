CREATE TABLE `agenda_checks` (
	`ref` text NOT NULL,
	`date` text NOT NULL,
	PRIMARY KEY(`ref`, `date`)
);
--> statement-breakpoint
CREATE TABLE `agenda_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`start` text,
	`end` text,
	`repeat` text,
	`until` text,
	`skipped` text DEFAULT '[]' NOT NULL,
	`series_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agenda_events_date` ON `agenda_events` (`date`);--> statement-breakpoint
CREATE TABLE `agenda_feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`color` text NOT NULL,
	`position` real NOT NULL,
	`content` text,
	`fetched_at` integer,
	`error` text,
	`created_at` integer NOT NULL
);
