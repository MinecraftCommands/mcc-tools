CREATE TABLE `mcc-gadgets_tempPost` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256),
	`created_by` text(255) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `mcc-gadgets_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `created_by_idx` ON `mcc-gadgets_tempPost` (`created_by`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `mcc-gadgets_tempPost` (`name`);