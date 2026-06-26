import { getDb, platformCredentialsTable } from "./db";
import type { Env } from "./types";
import { eq, and } from "drizzle-orm";

/**
 * Save a platform credential to Neon DB (via Worker).
 * This keeps the Neon DB in sync with KV tokens.
 */
export async function saveCredentialToDb(
  env: Env,
  platform: string,
  label: string,
  accessToken: string,
  opts?: {
    refreshToken?: string;
    clientId?: string;   // pageId for Facebook, igUserId for Instagram
  }
): Promise<void> {
  if (!env.DATABASE_URL) return; // silently skip if not configured

  try {
    const db = getDb(env.DATABASE_URL);

    // Find existing credential with same platform + label
    const existing = await db
      .select({ id: platformCredentialsTable.id })
      .from(platformCredentialsTable)
      .where(
        and(
          eq(platformCredentialsTable.platform, platform),
          eq(platformCredentialsTable.label, label)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing credential
      await db
        .update(platformCredentialsTable)
        .set({
          accessToken,
          refreshToken: opts?.refreshToken ?? null,
          clientId: opts?.clientId ?? null,
          isValid: true,
        })
        .where(eq(platformCredentialsTable.id, existing[0].id));
    } else {
      // Insert new credential
      await db.insert(platformCredentialsTable).values({
        platform,
        label,
        accessToken,
        refreshToken: opts?.refreshToken ?? null,
        clientId: opts?.clientId ?? null,
        isValid: true,
      });
    }
  } catch (err) {
    // Don't fail the OAuth flow — just log
    console.error("saveCredentialToDb error:", err);
  }
}

/**
 * Delete a platform credential from Neon DB by platform + label.
 */
export async function deleteCredentialFromDb(
  env: Env,
  platform: string,
  label: string
): Promise<void> {
  if (!env.DATABASE_URL) return;
  try {
    const db = getDb(env.DATABASE_URL);
    await db
      .delete(platformCredentialsTable)
      .where(
        and(
          eq(platformCredentialsTable.platform, platform),
          eq(platformCredentialsTable.label, label)
        )
      );
  } catch (err) {
    console.error("deleteCredentialFromDb error:", err);
  }
}
