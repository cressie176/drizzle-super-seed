CREATE TABLE `holiday_homes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pitch_id` integer NOT NULL,
	`owner_id` integer NOT NULL,
	`model` text NOT NULL,
	FOREIGN KEY (`pitch_id`) REFERENCES `pitches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lettings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holiday_home_id` integer NOT NULL,
	`guest_name` text(200) NOT NULL,
	`status` text(20) DEFAULT 'pending' NOT NULL,
	`start_date` integer NOT NULL,
	`cleaning_fee` text(12) NOT NULL,
	FOREIGN KEY (`holiday_home_id`) REFERENCES `holiday_homes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `owners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text(200) NOT NULL,
	`email` text(320) NOT NULL,
	`member_since` integer NOT NULL,
	`referred_by_owner_id` integer,
	FOREIGN KEY (`referred_by_owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owners_email_unique` ON `owners` (`email`);--> statement-breakpoint
CREATE TABLE `parks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(120) NOT NULL,
	`region` text(40) NOT NULL,
	`opened_at` integer NOT NULL,
	`latitude` real,
	`amenities` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pitches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`park_id` integer NOT NULL,
	`reference` text(20) NOT NULL,
	`monthly_fee` text(12) NOT NULL,
	FOREIGN KEY (`park_id`) REFERENCES `parks`(`id`) ON UPDATE no action ON DELETE no action
);
