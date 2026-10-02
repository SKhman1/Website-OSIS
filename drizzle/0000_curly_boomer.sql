CREATE TABLE `aspirations` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "category_valid" CHECK("aspirations"."category" IN ('kegiatan', 'fasilitas', 'osis', 'lainnya')),
	CONSTRAINT "status_valid" CHECK("aspirations"."status" IN ('new', 'reviewed', 'archived')),
	CONSTRAINT "subject_length" CHECK(length("aspirations"."subject") BETWEEN 3 AND 120),
	CONSTRAINT "message_length" CHECK(length("aspirations"."message") BETWEEN 10 AND 3000)
);
--> statement-breakpoint
CREATE INDEX `aspirations_status_created_idx` ON `aspirations` (`status`,`created_at`);