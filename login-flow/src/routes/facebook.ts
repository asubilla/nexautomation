import { Hono } from "hono";
import type { Env } from "../lib/types";
import { saveToken } from "../lib/kv";

const facebook = new Hono<{ Bindings: Env }>();

// GET /auth/facebook — redirect to Facebook consent screen
facebook.get("/", (c) => {
  const { FACEBOOK_APP_ID } = c.env;
  if (!FACEBOOK_APP_ID) return c.json({ error: "Facebook App ID not configured" }, 500);

  const workerUrl = new URL(c.req.url);
  const redirectUri = `${workerUrl.origin}/auth/facebook/callback`;
  const state = crypto.randomUUID();

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_manage_engagement",
    "pages_read_user_content",
    "business_management",
    "email",
    "public_profile",
  ].join(","));

  return c.redirect(authUrl.toString());
});

// GET /auth/facebook/callback
facebook.get("/callback", async (c) => {
  const { FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FRONTEND_URL } = c.env;
  const { code, error } = c.req.query();

  if (error) return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(error)}`);
  if (!code) return c.redirect(`${FRONTEND_URL}/credentials?error=no_code`);

  try {
    const workerUrl = new URL(c.req.url);
    const redirectUri = `${workerUrl.origin}/auth/facebook/callback`;

    // Exchange code for short-lived token
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

    // Exchange for long-lived token (60 days)
    const llUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
    llUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    llUrl.searchParams.set("fb_exchange_token", tokenData.access_token);
    const llRes = await fetch(llUrl.toString());
    const llData = await llRes.json() as any;
    const longToken = llData.access_token || tokenData.access_token;

    // Get user's pages
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`);
    const pagesData = await pagesRes.json() as any;
    const pages = pagesData.data || [];

    // Save each page as a separate token
    for (const page of pages) {
      await saveToken(c.env.AUTH_TOKENS, `facebook_page_${page.id}`, {
        platform: "facebook",
        accessToken: page.access_token,
        pageId: page.id,
        pageName: page.name,
        connectedAt: Date.now(),
      });
    }

    // Also save the user token
    await saveToken(c.env.AUTH_TOKENS, "facebook", {
      platform: "facebook",
      accessToken: longToken,
      expiresAt: Date.now() + (llData.expires_in || 5184000) * 1000,
      username: "Facebook User",
      connectedAt: Date.now(),
    });

    const pagesSerialized = JSON.stringify(pages.map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
    })));

    const searchParams = new URLSearchParams({
      facebook_connected: "true",
      pages: pagesSerialized,
    });

    return c.redirect(`${FRONTEND_URL}/credentials?${searchParams.toString()}`);
  } catch (err: any) {
    return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(err.message)}`);
  }
});

export default facebook;
