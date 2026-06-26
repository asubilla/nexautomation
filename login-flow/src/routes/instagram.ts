import { Hono } from "hono";
import type { Env } from "../lib/types";
import { saveToken } from "../lib/kv";

const instagram = new Hono<{ Bindings: Env }>();

// GET /auth/instagram — redirect to Meta/Instagram consent screen
instagram.get("/", (c) => {
  const { FACEBOOK_APP_ID } = c.env;
  if (!FACEBOOK_APP_ID) return c.json({ error: "Instagram App ID not configured" }, 500);

  const workerUrl = new URL(c.req.url);
  const redirectUri = `${workerUrl.origin}/auth/instagram/callback`;
  const state = crypto.randomUUID();

  // Instagram uses Facebook OAuth but with instagram_basic + instagram_content_publish scopes
  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
    "public_profile",
  ].join(","));

  return c.redirect(authUrl.toString());
});

// GET /auth/instagram/callback
instagram.get("/callback", async (c) => {
  const { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FRONTEND_URL } = c.env;
  const { code, error } = c.req.query();

  if (error) return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(error)}`);
  if (!code) return c.redirect(`${FRONTEND_URL}/credentials?error=no_code`);

  try {
    const workerUrl = new URL(c.req.url);
    const redirectUri = `${workerUrl.origin}/auth/instagram/callback`;

    // Exchange code for user access token
    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
    tokenUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json() as any;

    if (!tokenData.access_token) {
      return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(tokenData.error?.message || "token_failed")}`);
    }

    // Exchange for long-lived token
    const llUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
    llUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    llUrl.searchParams.set("fb_exchange_token", tokenData.access_token);
    const llRes = await fetch(llUrl.toString());
    const llData = await llRes.json() as any;
    const longToken = llData.access_token || tokenData.access_token;

    // Get pages with Instagram accounts linked
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account&access_token=${longToken}`
    );
    const pagesData = await pagesRes.json() as any;
    const pages = pagesData.data || [];

    let igUsername = "Instagram Account";
    let igAccountId = "";

    for (const page of pages) {
      if (page.instagram_business_account) {
        igAccountId = page.instagram_business_account.id;
        // Get Instagram username
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,name&access_token=${longToken}`
        );
        const igData = await igRes.json() as any;
        igUsername = igData.username || igData.name || "Instagram Account";
        break;
      }
    }

    await saveToken(c.env.AUTH_TOKENS, "instagram", {
      platform: "instagram",
      accessToken: longToken,
      pageId: igAccountId,
      username: igUsername,
      expiresAt: Date.now() + (llData.expires_in || 5184000) * 1000,
      connectedAt: Date.now(),
    });

    const searchParams = new URLSearchParams({
      instagram_connected: "true",
      username: igUsername,
      accessToken: longToken,
      clientId: igAccountId,
    });

    return c.redirect(`${FRONTEND_URL}/credentials?${searchParams.toString()}`);
  } catch (err: any) {
    return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(err.message)}`);
  }
});

export default instagram;
