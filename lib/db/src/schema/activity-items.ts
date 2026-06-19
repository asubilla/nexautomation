import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityItemsTable = pgTable("activity_items", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  platform: text("platform").notNull(),
  username: text("username"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivityItemSchema = createInsertSchema(activityItemsTable).omit({ id: true, createdAt: true });
export type InsertActivityItem = z.infer<typeof insertActivityItemSchema>;
export type ActivityItem = typeof activityItemsTable.$inferSelect;
