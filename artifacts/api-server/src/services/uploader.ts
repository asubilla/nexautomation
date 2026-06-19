import { readFileSync, existsSync } from "fs";
import { db, platformCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface UploadResult {
  success: boolean;
  uploadedUrl?: string;
  errorMessage?: string;
}

async function getCredential(platform: string) {
  const [cred] = await db
    .select()
    .from(platformCredentialsTable)
    .where(eq(platformCredentialsTable.platform, platform))
    .limit(1);
  return cred;
}

export async function uploadVideo(
  platform: string,
  filePath: string,
  title: string,
  hashtags: string
): Promise<UploadResult> {
  if (!existsSync(filePath)) {
    return { success: false, errorMessage: "Video file not found on disk" };
  }

  const cred = await getCredential(platform);
  if (!cred) {
    return {
      success: false,
      errorMessage: `No credentials configured for ${platform}. Add credentials in the Credentials page.`,
    };
  }

  const description = `${title}\n\n${hashtags}`;

  try {
    switch (platform) {
      case "youtube":
        return await uploadToYouTube(filePath, title, description, cred.accessToken, cred.refreshToken ?? undefined, cred.clientId ?? undefined, cred.clientSecret ?? undefined);
      case "tiktok":
        return await uploadToTikTok(filePath, title, hashtags, cred.accessToken);
      case "instagram":
        return await uploadToInstagram(filePath, title, hashtags, cred.accessToken);
      case "facebook":
        return await uploadToFacebook(filePath, title, description, cred.accessToken);
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
        snippet: { title: title.slice(0, 100), description: description.slice(0, 5000) },
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
  accessToken: string
): Promise<UploadResult> {
  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: `${title} ${hashtags}`.slice(0, 150),
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
  });

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
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Range": `bytes 0-${fileData.byteLength - 1}/${fileData.byteLength}`,
      "Content-Type": "video/mp4",
    },
    body: fileData,
  });

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
  accessToken: string
): Promise<UploadResult> {
  const meRes = await fetch(`https://graph.instagram.com/me?fields=id&access_token=${accessToken}`);
  if (!meRes.ok) {
    return { success: false, errorMessage: "Invalid Instagram access token" };
  }
  const meData = await meRes.json() as any;
  const userId = meData.id;

  const caption = `${title}\n\n${hashtags}`;

  const containerRes = await fetch(
    `https://graph.instagram.com/v19.0/${userId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        caption: caption.slice(0, 2200),
        access_token: accessToken,
        share_to_feed: true,
      }),
    }
  );

  if (!containerRes.ok) {
    const err = await containerRes.text();
    return { success: false, errorMessage: `Instagram container error: ${err.slice(0, 200)}` };
  }

  const containerData = await containerRes.json() as any;
  const containerId = containerData.id;

  const publishRes = await fetch(
    `https://graph.instagram.com/v19.0/${userId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    }
  );

  if (!publishRes.ok) {
    const err = await publishRes.text();
    return { success: false, errorMessage: `Instagram publish error: ${err.slice(0, 200)}` };
  }

  const publishData = await publishRes.json() as any;
  return {
    success: true,
    uploadedUrl: `https://instagram.com/p/${publishData.id}`,
  };
}

async function uploadToFacebook(
  filePath: string,
  title: string,
  description: string,
  accessToken: string
): Promise<UploadResult> {
  const meRes = await fetch(`https://graph.facebook.com/me?fields=id&access_token=${accessToken}`);
  if (!meRes.ok) {
    return { success: false, errorMessage: "Invalid Facebook access token" };
  }
  const meData = await meRes.json() as any;
  const userId = meData.id;

  const fileData = readFileSync(filePath);

  const formData = new FormData();
  formData.append("title", title.slice(0, 100));
  formData.append("description", description.slice(0, 2000));
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
