CREATE TABLE `mcc-gadgets_account` (
	`user_id` text(255) NOT NULL,
	`type` text(255) NOT NULL,
	`provider` text(255) NOT NULL,
	`provider_account_id` text(255) NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text(255),
	`scope` text(255),
	`id_token` text,
	`session_state` text(255),
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `mcc-gadgets_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `mcc-gadgets_account` (`user_id`);--> statement-breakpoint
CREATE TABLE `mcc-gadgets_session` (
	`session_token` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `mcc-gadgets_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `mcc-gadgets_session` (`userId`);--> statement-breakpoint
CREATE TABLE `mcc-gadgets_user` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255),
	`email` text(255),
	`email_verified` integer,
	`image` text(255)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcc-gadgets_user_email_unique` ON `mcc-gadgets_user` (`email`);--> statement-breakpoint
CREATE TABLE `mcc-gadgets_verification_token` (
	`identifier` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
