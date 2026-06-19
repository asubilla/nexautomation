import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const monitoredAccountsTable = pgTable("monitored_accounts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  username: text("username").notNull(),
  url: text("url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  uploadTargets: text("upload_targets").notNull().default("[]"),
  latestVideoId: text("latest_video_id"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastVideoAt: timestamp("last_video_at", { withTimezone: true }),
  totalDownloaded: integer("total_downloaded").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMonitoredAccountSchema = createInsertSchema(monitoredAccountsTable).omit({ id: true, createdAt: true, totalDownloaded: true });
export type InsertMonitoredAccount = z.infer<typeof insertMonitoredAccountSchema>;
export type MonitoredAccount = typeof monitoredAccountsTable.$inferSelect;
