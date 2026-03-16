CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`split_id` text NOT NULL,
	`feature` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`duration_seconds` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`split_id`) REFERENCES `splits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_usage_split_idx` ON `ai_usage` (`split_id`);