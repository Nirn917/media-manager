CREATE TABLE `autoarchive_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`category` text,
	`days_after_played` integer,
	`min_backup_count` integer DEFAULT 1 NOT NULL,
	`last_run_at` text
);
--> statement-breakpoint
CREATE TABLE `jellyfin_index` (
	`path` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`title` text,
	`played` integer DEFAULT 0 NOT NULL,
	`last_played` text,
	`jellyfin_url` text
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`path` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0,
	`started_at` text,
	`finished_at` text,
	`error` text,
	`media_id` integer,
	`category` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pcloud_index` (
	`path` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`modtime` text,
	`hash` text,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
