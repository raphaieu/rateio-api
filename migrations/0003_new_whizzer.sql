DROP INDEX "extras_split_idx";--> statement-breakpoint
DROP INDEX "item_shares_pk";--> statement-breakpoint
DROP INDEX "items_split_idx";--> statement-breakpoint
DROP INDEX "participants_split_idx";--> statement-breakpoint
DROP INDEX "payments_provider_idx";--> statement-breakpoint
DROP INDEX "payments_split_idx";--> statement-breakpoint
DROP INDEX "splits_public_slug_unique";--> statement-breakpoint
DROP INDEX "splits_owner_idx";--> statement-breakpoint
DROP INDEX "splits_public_slug_idx";--> statement-breakpoint
DROP INDEX "wallet_ledger_owner_idx";--> statement-breakpoint
ALTER TABLE `payments` ALTER COLUMN "owner_clerk_user_id" TO "owner_clerk_user_id" text;--> statement-breakpoint
CREATE INDEX `extras_split_idx` ON `extras` (`split_id`);--> statement-breakpoint
CREATE INDEX `item_shares_pk` ON `item_shares` (`item_id`,`participant_id`);--> statement-breakpoint
CREATE INDEX `items_split_idx` ON `items` (`split_id`);--> statement-breakpoint
CREATE INDEX `participants_split_idx` ON `participants` (`split_id`);--> statement-breakpoint
CREATE INDEX `payments_provider_idx` ON `payments` (`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payments_split_idx` ON `payments` (`split_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `splits_public_slug_unique` ON `splits` (`public_slug`);--> statement-breakpoint
CREATE INDEX `splits_owner_idx` ON `splits` (`owner_clerk_user_id`);--> statement-breakpoint
CREATE INDEX `splits_public_slug_idx` ON `splits` (`public_slug`);--> statement-breakpoint
CREATE INDEX `wallet_ledger_owner_idx` ON `wallet_ledger` (`owner_clerk_user_id`);--> statement-breakpoint
ALTER TABLE `payments` ADD `owner_guest_id` text;--> statement-breakpoint
ALTER TABLE `splits` ALTER COLUMN "owner_clerk_user_id" TO "owner_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE `splits` ADD `owner_guest_id` text;