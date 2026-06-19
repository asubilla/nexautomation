import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { downloadJobsTable } from "./download-jobs";

export const uploadJobsTable = pgTable("upload_jobs", {
  id: serial("id").primaryKey(),
  downloadJobId: integer("download_job_id").notNull().references(() => downloadJobsTable.id, { onDelete: "cascade" }),
  targetPlatform: text("target_platform").notNull(),
  aiTitle: text("ai_title"),
  aiHashtags: text("ai_hashtags"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  uploadedUrl: text("uploaded_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertUploadJobSchema = createInsertSchema(uploadJobsTable).omit({ id: true, createdAt: true, completedAt: true, status: true, errorMessage: true, uploadedUrl: true });
export type InsertUploadJob = z.infer<typeof insertUploadJobSchema>;
export type UploadJob = typeof uploadJobsTable.$inferSelect;
