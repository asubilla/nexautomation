import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { downloadJobsTable } from "./download-jobs";

export const uploadJobsTable = pgTable("upload_jobs", {
  id: serial("id").primaryKey(),
  downloadJobId: integer("download_job_id").notNull().references(() => downloadJobsTable.id, { onDelete: "cascade" }),
  targetPlatform: text("target_platform").notNull(),
  localClipPath: text("local_clip_path"),
  aiTitle: text("ai_title"),
  aiDescription: text("ai_description"),
  aiHashtags: text("ai_hashtags"),
  aiTags: text("ai_tags"),                          // JSON array as text
  aiLocation: text("ai_location"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  uploadedUrl: text("uploaded_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertUploadJobSchema = createInsertSchema(uploadJobsTable).omit({ id: true, createdAt: true, completedAt: true, status: true, errorMessage: true, uploadedUrl: true });
export type InsertUploadJob = z.infer<typeof insertUploadJobSchema>;
export type UploadJob = typeof uploadJobsTable.$inferSelect;
