import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformCredentialsTable = pgTable("platform_credentials", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  label: text("label").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  isValid: boolean("is_valid").notNull().default(true),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlatformCredentialSchema = createInsertSchema(platformCredentialsTable).omit({ id: true, connectedAt: true, isValid: true });
export type InsertPlatformCredential = z.infer<typeof insertPlatformCredentialSchema>;
export type PlatformCredential = typeof platformCredentialsTable.$inferSelect;
