CREATE TABLE IF NOT EXISTS `actions` (
	`room_id` text NOT NULL,
	`action_index` integer NOT NULL,
	`action_json` text NOT NULL,
	CONSTRAINT `actions_pk` PRIMARY KEY(`room_id`, `action_index`),
	CONSTRAINT `fk_actions_room_id_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` text PRIMARY KEY,
	`room_kind` text NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`nickname` text,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `metadata` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rooms` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`max_players` integer NOT NULL,
	`winner` integer,
	`finish_reason` text,
	`settings_json` text NOT NULL,
	`password` text,
	`clock_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`player` integer NOT NULL,
	`nickname` text,
	`last_seen_at` integer NOT NULL,
	CONSTRAINT `fk_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_sessions_room_id_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `study_rooms` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`private` integer NOT NULL,
	`document_json` text NOT NULL,
	`members_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY,
	`nickname` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
