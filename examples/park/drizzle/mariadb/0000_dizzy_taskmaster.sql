CREATE TABLE `holiday_homes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`pitch_id` bigint NOT NULL,
	`owner_id` int NOT NULL,
	`model` text NOT NULL,
	CONSTRAINT `holiday_homes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`holiday_home_id` bigint NOT NULL,
	`guest_name` varchar(200) NOT NULL,
	`status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
	`start_date` date NOT NULL,
	`cleaning_fee` varchar(12) NOT NULL,
	CONSTRAINT `lettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `owners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(200) NOT NULL,
	`email` varchar(320) NOT NULL,
	`member_since` date NOT NULL,
	`referred_by_owner_id` int,
	CONSTRAINT `owners_id` PRIMARY KEY(`id`),
	CONSTRAINT `owners_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `parks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`region` varchar(40) NOT NULL,
	`opened_at` date NOT NULL,
	`latitude` double,
	`amenities` json,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `parks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pitches` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`park_id` int NOT NULL,
	`reference` varchar(20) NOT NULL,
	`monthly_fee` varchar(12) NOT NULL,
	CONSTRAINT `pitches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `holiday_homes` ADD CONSTRAINT `holiday_homes_pitch_id_pitches_id_fk` FOREIGN KEY (`pitch_id`) REFERENCES `pitches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `holiday_homes` ADD CONSTRAINT `holiday_homes_owner_id_owners_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lettings` ADD CONSTRAINT `lettings_holiday_home_id_holiday_homes_id_fk` FOREIGN KEY (`holiday_home_id`) REFERENCES `holiday_homes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `owners` ADD CONSTRAINT `owners_referred_by_owner_id_owners_id_fk` FOREIGN KEY (`referred_by_owner_id`) REFERENCES `owners`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pitches` ADD CONSTRAINT `pitches_park_id_parks_id_fk` FOREIGN KEY (`park_id`) REFERENCES `parks`(`id`) ON DELETE no action ON UPDATE no action;