CREATE TABLE `extras` (
	`id` text PRIMARY KEY NOT NULL,
	`split_id` text NOT NULL,
	`type` text NOT NULL,
	`value_cents` integer,
	`value_percent_bp` integer,
	`allocation_mode` text NOT NULL,
	FOREIGN KEY (`split_id`) REFERENCES `splits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `extras_split_idx` ON `extras` (`split_id`);--> statement-breakpoint
CREATE TABLE `item_shares` (
	`item_id` text NOT NULL,
	`participant_id` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_shares_pk` ON `item_shares` (`item_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`split_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`split_id`) REFERENCES `splits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `items_split_idx` ON `items` (`split_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`split_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`split_id`) REFERENCES `splits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `participants_split_idx` ON `participants` (`split_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_clerk_user_id` text NOT NULL,
	`split_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`amount_cents_total` integer NOT NULL,
	`amount_cents_split_cost` integer NOT NULL,
	`amount_cents_topup` integer DEFAULT 0 NOT NULL,
	`provider_payment_id` text,
	`qr_code` text,
	`qr_copy_paste` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`split_id`) REFERENCES `splits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_provider_idx` ON `payments` (`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payments_split_idx` ON `payments` (`split_id`);--> statement-breakpoint
CREATE TABLE `split_costs` (
	`split_id` text PRIMARY KEY NOT NULL,
	`base_fee_cents` integer NOT NULL,
	`ai_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`split_id`) REFERENCES `splits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `splits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_clerk_user_id` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`receipt_image_url` text,
	`public_slug` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `splits_public_slug_unique` ON `splits` (`public_slug`);--> statement-breakpoint
CREATE INDEX `splits_owner_idx` ON `splits` (`owner_clerk_user_id`);--> statement-breakpoint
CREATE INDEX `splits_public_slug_idx` ON `splits` (`public_slug`);--> statement-breakpoint
CREATE TABLE `wallet_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_clerk_user_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_clerk_user_id`) REFERENCES `wallets`(`owner_clerk_user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wallet_ledger_owner_idx` ON `wallet_ledger` (`owner_clerk_user_id`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`owner_clerk_user_id` text PRIMARY KEY NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL
);
