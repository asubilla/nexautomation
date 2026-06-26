import { readFileSync, existsSync } from "fs";
import { db, platformCredentialsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { HttpsProxyAgent } from "https-proxy-agent";
import { uploadToTikTokPlaywright } from "./tiktok-playwright";
import { uploadToInstagramPlaywright } from "./instagram-playwright";
import { uploadToFacebookPlaywright } from "./facebook-playwright";
import { uploadToTikTokAPI } from "./tiktok-api";

export interface UploadResult {
  success: boolean;
  uploadedUrl?: string;
  errorMessage?: string;
}

async function getCredential(platform: string, label?: string) {
  if (label) {
    // Try to find by specific label first (for multi-account support)
    const [byLabel] = await db
      .select()
      .from(platformCredentialsTable)
      .where(eq(platformCredentialsTable.platform, platform))
      .limit(50);
    // Find matching label (case-insensitive)
    const all = await db
      .select()
      .from(platformCredentialsTable)
      .where(eq(platformCredentialsTable.platform, platform));
    const match = all.find(c => c.label.toLowerCase() === label.toLowerCase());
    if (match) return match;
  }
  // Fallback: first credential for this platform
  const [cred] = await db
    .select()
    .from(platformCredentialsTable)
    .where(eq(platformCredentialsTable.platform, platform))
    .limit(1);
  return cred;
}

// Load TikTok proxy from DB settings (cached per process)
let _cachedProxy: string | null | undefined = undefined;

async function getTikTokProxy(): Promise<string | null> {
  if (_cachedProxy !== undefined) return _cachedProxy;
  try {
    const [row] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "tiktok_proxy"));
    _cachedProxy = row?.value || null;
  } catch {
    _cachedProxy = null;
  }
  return _cachedProxy;
}

export function clearProxyCache(): void {
  _cachedProxy = undefined;
}

// Fetch with optional proxy (for TikTok UK proxy)
async function fetchWithProxy(
  url: string,
  options: RequestInit = {},
  proxyUrl?: string | null
): Promise<Response> {
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    return fetch(url, { ...options, dispatcher: agent } as any);
  }
  return fetch(url, options);
}

export async function uploadVideo(
  platform: string,
  filePath: string,
  title: string,
  hashtags: string,
  description?: string,
  tags: string[] = [],
  location?: string,
  credentialLabel?: string   // optional — pick specific account by label
): Promise<UploadResult> {
  if (!existsSync(filePath)) {
    return { success: false, errorMessage: "Video file not found on disk" };
  }

  const cred = await getCredential(platform, credentialLabel);
  if (!cred) {
    return {
      success: false,
      errorMessage: `No credentials configured for ${platform}. Add credentials in the Credentials page.`,
    };
  }

  // Full description: provided description + hashtags + location
  const fullDescription = [
    description ?? title,
    "",
    hashtags,
    location ? `📍 ${location}` : "",
  ].filter(Boolean).join("\n").trim();

  try {
    switch (platform) {
      case "youtube":
        return await uploadToYouTube(
          filePath, title, fullDescription, tags, cred.accessToken,
          cred.refreshToken ?? undefined, cred.clientId ?? undefined, cred.clientSecret ?? undefined
        );
      case "tiktok":
        if (cred.refreshToken && cred.clientId && cred.clientSecret) {
          logger.info("TikTok: Credentials contain client key/secret — using official TikTok API upload");
          const apiResult = await uploadToTikTokAPI(
            filePath, title, hashtags, description, cred.accessToken,
            cred.refreshToken, cred.clientId, cred.clientSecret
          );
          if (apiResult.success) {
            return { success: true, uploadedUrl: `https://www.tiktok.com/publish/${apiResult.publishId}` };
          } else {
            return { success: false, errorMessage: apiResult.errorMessage };
          }
        }
        logger.info("TikTok: No client credentials — falling back to Playwright browser automation");
        return await uploadToTikTokPlaywright(
          filePath, title, hashtags,
          { username: cred.label, password: cred.accessToken },
          location ?? "London, UK"
        );
      case "instagram":
        return await uploadToInstagramPlaywright(
          filePath,
          fullDescription,
          { username: cred.label, password: cred.accessToken }
        );
      case "facebook":
        return await uploadToFacebookPlaywright(
          filePath, title, fullDescription,
          { username: cred.label, password: cred.accessToken }
        );
      default:
        return { success: false, errorMessage: `Unsupported upload platform: ${platform}` };
    }
  } catch (err: any) {
    logger.error({ err, platform }, "Upload error");
    return { success: false, errorMessage: err.message };
  }
}

async function uploadToYouTube(
  filePath: string,
  title: string,
  description: string,
  tags: string[],
  accessToken: string,
  refreshToken?: string,
  clientId?: string,
  clientSecret?: string
): Promise<UploadResult> {
  let token = accessToken;

  if (refreshToken && clientId && clientSecret) {
    try {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const refreshData = await refreshRes.json() as any;
      if (refreshData.access_token) token = refreshData.access_token;
    } catch {
    }
  }

  const metadataRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: title.slice(0, 100),
          description: description.slice(0, 5000),
          tags: tags.slice(0, 30),              // YouTube max 30 tags
          categoryId: "22",                      // People & Blogs
        },
        status: { privacyStatus: "public" },
      }),
    }
  );

  if (!metadataRes.ok) {
    const err = await metadataRes.text();
    return { success: false, errorMessage: `YouTube metadata error: ${err.slice(0, 200)}` };
  }

  const uploadUrl = metadataRes.headers.get("location");
  if (!uploadUrl) {
    return { success: false, errorMessage: "YouTube did not return an upload URL" };
  }

  const fileData = readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(fileData.byteLength),
    },
    body: fileData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return { success: false, errorMessage: `YouTube upload error: ${err.slice(0, 200)}` };
  }

  const result = await uploadRes.json() as any;
  const videoId = result.id;
  return {
    success: true,
    uploadedUrl: `https://youtube.com/watch?v=${videoId}`,
  };
}

async function uploadToTikTok(
  filePath: string,
  title: string,
  hashtags: string,
  accessToken: string,
  location?: string
): Promise<UploadResult> {
  // Always use London, UK as default location for TikTok
  const effectiveLocation = location || "London, UK";
  const caption = `${title} ${hashtags} 📍${effectiveLocation}`;

  // Use UK proxy if configured
  const proxyUrl = await getTikTokProxy();
  if (proxyUrl) {
    logger.info({ proxy: proxyUrl.replace(/:([^:@]+)@/, ":***@") }, "TikTok: using UK proxy");
  } else {
    logger.info("TikTok: no proxy configured, uploading directly");
  }

  const initRes = await fetchWithProxy(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 150),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: readFileSync(filePath).byteLength,
          chunk_size: readFileSync(filePath).byteLength,
          total_chunk_count: 1,
        },
      }),
    },
    proxyUrl
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    return { success: false, errorMessage: `TikTok init error: ${err.slice(0, 200)}` };
  }

  const initData = await initRes.json() as any;
  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;

  if (!uploadUrl) {
    return { success: false, errorMessage: "TikTok did not return upload URL" };
  }

  const fileData = readFileSync(filePath);
  const uploadRes = await fetchWithProxy(
    uploadUrl,
    {
      method: "PUT",
      headers: {
        "Content-Range": `bytes 0-${fileData.byteLength - 1}/${fileData.byteLength}`,
        "Content-Type": "video/mp4",
      },
      body: fileData,
    },
    proxyUrl
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return { success: false, errorMessage: `TikTok upload error: ${err.slice(0, 200)}` };
  }

  return {
    success: true,
    uploadedUrl: publishId ? `https://tiktok.com/@me/video/${publishId}` : undefined,
  };
}

async function uploadToInstagram(
  filePath: string,
  title: string,
  hashtags: string,
  accessToken: string,
  location?: string
): Promise<UploadResult> {
  // NOTE: Instagram Graph API requires a publicly accessible video URL for Reels.
  // Direct file upload is not supported via the Graph API.
  // This function uses the Reels Publishing API with a video_url parameter.
  // For local files, the Playwright uploader (uploadToInstagramPlaywright) is preferred.

  const meRes = await fetch(`https://graph.instagram.com/me?fields=id&access_token=${accessToken}`);
  if (!meRes.ok) {
    return { success: false, errorMessage: "Invalid Instagram access token" };
  }
  const meData = await meRes.json() as any;
  const userId = meData.id;

  const caption = location
    ? `${title}\n\n${hashtags}\n\n📍 ${location}`
    : `${title}\n\n${hashtags}`;

  // Instagram Graph API Reels publishing requires a public video URL.
  // Local file path cannot be used directly — use Playwright uploader for local files.
  return {
    success: false,
    errorMessage: "Instagram Graph API requires a public video URL. Use Playwright uploader for local files.",
  };
}


async function uploadToFacebook(
  filePath: string,
  title: string,
  description: string,
  accessToken: string,
  location?: string
): Promise<UploadResult> {
  const meRes = await fetch(`https://graph.facebook.com/me?fields=id&access_token=${accessToken}`);
  if (!meRes.ok) {
    return { success: false, errorMessage: "Invalid Facebook access token" };
  }
  const meData = await meRes.json() as any;
  const userId = meData.id;

  const fullDescription = location
    ? `${description}\n\n📍 ${location}`
    : description;

  const fileData = readFileSync(filePath);

  const formData = new FormData();
  formData.append("title", title.slice(0, 100));
  formData.append("description", fullDescription.slice(0, 2000));
  formData.append("access_token", accessToken);
  formData.append("file", new Blob([fileData], { type: "video/mp4" }), "video.mp4");

  const uploadRes = await fetch(
    `https://graph.facebook.com/v19.0/${userId}/videos`,
    { method: "POST", body: formData }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return { success: false, errorMessage: `Facebook upload error: ${err.slice(0, 200)}` };
  }

  const uploadData = await uploadRes.json() as any;
  return {
    success: true,
    uploadedUrl: `https://facebook.com/video/${uploadData.id}`,
  };
}
