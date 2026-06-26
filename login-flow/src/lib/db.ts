import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// Neon DB client (Worker pe HTTP mode use hota hai)
export function getDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql);
}

// Platform credentials table schema (same as in lib/db)
import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const platformCredentialsTable = pgTable("platform_credentials", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  label: text("label").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  loginUsername: text("login_username"),
  loginPassword: text("login_password"),
  isValid: boolean("is_valid").notNull().default(true),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformCredential = typeof platformCredentialsTable.$inferSelect;
export type InsertPlatformCredential = typeof platformCredentialsTable.$inferInsert;
