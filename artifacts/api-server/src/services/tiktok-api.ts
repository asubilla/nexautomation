import { statSync, readFileSync } from "fs";
import { db, platformCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

interface UploadResult {
  success: boolean;
  errorMessage?: string;
  publishId?: string;
}

// Refresh TikTok access token using refresh token
export async function refreshTikTokToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<string | null> {
  try {
    logger.info("TikTok API: Attempting to refresh access token");
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await res.json() as any;

    if (data.access_token) {
      // Save new tokens to DB
      await db
        .update(platformCredentialsTable)
        .set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token || refreshToken, // fallback to old refresh token if not returned
          isValid: true,
          connectedAt: new Date(),
        })
        .where(eq(platformCredentialsTable.platform, "tiktok"));

      logger.info("TikTok API: Access token refreshed successfully");
      return data.access_token;
    } else {
      logger.error({ data }, "TikTok API: Token refresh response error");
      return null;
    }
  } catch (err: any) {
    logger.error({ err }, "TikTok API: Token refresh exception");
    return null;
  }
}

// Upload video using official TikTok Content Posting API v2
export async function uploadToTikTokAPI(
  filePath: string,
  title: string,
  hashtags: string,
  description: string | undefined,
  accessToken: string,
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<UploadResult> {
  logger.info({ filePath, title }, "TikTok API: Starting official upload");

  // 1. Refresh access token first to ensure it is valid
  const token = await refreshTikTokToken(refreshToken, clientKey, clientSecret) || accessToken;

  // 2. Prepare file metadata
  let videoSize = 0;
  let videoBytes: Buffer;
  try {
    const stats = statSync(filePath);
    videoSize = stats.size;
    videoBytes = readFileSync(filePath);
  } catch (err: any) {
    return { success: false, errorMessage: `Failed to read video file: ${err.message}` };
  }

  const fullTitle = `${title} ${hashtags}`.trim();

  // Try Direct Post first, fallback to Inbox (Draft) if it fails
  let initData: any = null;
  let flow = "Direct Post";

  try {
    logger.info("TikTok API: Initializing Direct Post...");
    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: fullTitle.slice(0, 150), // TikTok title caption limit is typically 150-2200 chars
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      }),
    });

    initData = await initRes.json() as any;

    // Fallback to Inbox/Draft flow if Direct Post is not allowed or fails
    if (initData.error?.code && initData.error.code !== "ok" && initData.error.code !== 0) {
      logger.warn({ error: initData.error }, "TikTok API: Direct Post init failed, trying Inbox (Draft) fallback...");
      flow = "Inbox Draft";

      const fallbackRes = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        }),
      });

      initData = await fallbackRes.json() as any;
    }
  } catch (err: any) {
    logger.error({ err }, "TikTok API: Exception initializing upload");
    return { success: false, errorMessage: `Initialization exception: ${err.message}` };
  }

  if (!initData?.data?.upload_url) {
    const errMsg = initData?.error?.message || "Failed to get upload URL";
    logger.error({ initData }, "TikTok API: Initialization failed");
    return { success: false, errorMessage: `Initialization failed: ${errMsg}` };
  }

  const { upload_url, publish_id } = initData.data;
  logger.info({ publish_id, flow }, "TikTok API: Upload initialized successfully");

  // 3. Upload binary file to the upload URL via PUT
  try {
    logger.info({ upload_url: upload_url.slice(0, 100) }, "TikTok API: Uploading file bytes...");
    const uploadRes = await fetch(upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": videoSize.toString(),
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      body: videoBytes,
    });

    if (!uploadRes.ok) {
      const uploadErr = await uploadRes.text();
      logger.error({ status: uploadRes.status, uploadErr }, "TikTok API: Byte upload failed");
      return { success: false, errorMessage: `Byte upload failed: HTTP ${uploadRes.status}` };
    }
  } catch (err: any) {
    logger.error({ err }, "TikTok API: Exception uploading file bytes");
    return { success: false, errorMessage: `Byte upload exception: ${err.message}` };
  }

  logger.info({ publish_id }, "TikTok API: Video upload complete, monitoring status...");

  // 4. Poll publish status
  let attempts = 0;
  while (attempts < 10) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          publish_id: publish_id,
        }),
      });

      const statusData = await statusRes.json() as any;
      const status = statusData.data?.status;
      logger.info({ publish_id, status, attempts }, "TikTok API: Status poll");

      if (status === "SUCCESS") {
        return { success: true, publishId: publish_id };
      } else if (status === "FAILED") {
        const failReason = statusData.data?.fail_reason || "Unknown publish failure";
        return { success: false, errorMessage: `Publish failed: ${failReason}`, publishId: publish_id };
      }
    } catch (err: any) {
      logger.warn({ err }, "TikTok API: Status poll error, will retry...");
    }
    attempts++;
  }

  // If still processing, assume success or return success with ID so the user can verify later
  return { success: true, publishId: publish_id, errorMessage: "Upload complete but status still processing on TikTok side." };
}
