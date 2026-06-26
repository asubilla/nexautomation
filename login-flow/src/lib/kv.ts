import type { TokenData, Env } from "./types";

const KEY_PREFIX = "token:";

export async function saveToken(kv: KVNamespace, platform: string, data: TokenData): Promise<void> {
  await kv.put(`${KEY_PREFIX}${platform}`, JSON.stringify(data));
}

export async function getToken(kv: KVNamespace, platform: string): Promise<TokenData | null> {
  const raw = await kv.get(`${KEY_PREFIX}${platform}`);
  if (!raw) return null;
  return JSON.parse(raw) as TokenData;
}

export async function deleteToken(kv: KVNamespace, platform: string): Promise<void> {
  await kv.delete(`${KEY_PREFIX}${platform}`);
}

export async function getAllTokens(kv: KVNamespace): Promise<Record<string, TokenData>> {
  const list = await kv.list({ prefix: KEY_PREFIX });
  const result: Record<string, TokenData> = {};
  for (const key of list.keys) {
    const platform = key.name.replace(KEY_PREFIX, "");
    const data = await getToken(kv, platform);
    if (data) result[platform] = data;
  }
  return result;
}
