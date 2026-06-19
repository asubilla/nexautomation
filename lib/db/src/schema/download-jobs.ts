import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { monitoredAccountsTable } from "./monitored-accounts";

export const downloadJobsTable = pgTable("download_jobs", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => monitoredAccountsTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  username: text("username").notNull(),
  videoUrl: text("video_url").notNull(),
  originalTitle: text("original_title"),
  thumbnailUrl: text("thumbnail_url"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertDownloadJobSchema = createInsertSchema(downloadJobsTable).omit({ id: true, createdAt: true, completedAt: true, status: true, errorMessage: true });
export type InsertDownloadJob = z.infer<typeof insertDownloadJobSchema>;
export type DownloadJob = typeof downloadJobsTable.$inferSelect;
