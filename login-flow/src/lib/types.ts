export interface Env {
  AUTH_TOKENS: KVNamespace;
  NEX_UPLOADS: R2Bucket;
  FRONTEND_URL: string;
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
  FACEBOOK_APP_ID: string;
  FACEBOOK_APP_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  INSTAGRAM_APP_ID: string;
  INSTAGRAM_APP_SECRET: string;
}

export interface TokenData {
  platform: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  pageId?: string;
  pageName?: string;
  username?: string;
  connectedAt: number;
}
