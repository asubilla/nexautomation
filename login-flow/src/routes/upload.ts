import { Hono } from "hono";
import type { Env } from "../lib/types";
import { getToken } from "../lib/kv";

const upload = new Hono<{ Bindings: Env }>();

// POST /upload/youtube - stream directly to YouTube
upload.post("/youtube", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No video file provided" }, 400);
    }

    const title = body.title as string || "Uploaded Video";
    const description = body.description as string || "";
    const tags = body.tags ? JSON.parse(body.tags as string) : [];

    const tokenData = await getToken(c.env.AUTH_TOKENS, "youtube");
    if (!tokenData) return c.json({ error: "YouTube account not connected" }, 400);

    const fileData = await file.arrayBuffer();

    // Refresh Google Token if needed
    let token = tokenData.accessToken;
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = c.env;
    if (tokenData.refreshToken && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
      try {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: tokenData.refreshToken,
            grant_type: "refresh_token",
          }),
        });
        const refreshData = await refreshRes.json() as any;
        if (refreshData.access_token) token = refreshData.access_token;
      } catch {}
    }

    // 1. Init resumable upload
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
            tags: tags.slice(0, 30),
            categoryId: "22",
          },
          status: { privacyStatus: "public" },
        }),
      }
    );

    if (!metadataRes.ok) {
      const err = await metadataRes.text();
      return c.json({ error: `YouTube initialization failed: ${err}` }, 500);
    }

    const uploadUrl = metadataRes.headers.get("location");
    if (!uploadUrl) return c.json({ error: "YouTube did not return an upload URL" }, 500);

    // 2. Upload file bytes directly
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
      return c.json({ error: `YouTube byte upload failed: ${err}` }, 500);
    }

    const result = await uploadRes.json() as any;
    return c.json({
      success: true,
      videoId: result.id,
      uploadedUrl: `https://youtube.com/watch?v=${result.id}`
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /upload/tiktok - stream directly to TikTok
upload.post("/tiktok", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No video file provided" }, 400);
    }

    const title = body.title as string || "";
    const hashtags = body.hashtags as string || "";

    const tokenData = await getToken(c.env.AUTH_TOKENS, "tiktok");
    if (!tokenData) return c.json({ error: "TikTok account not connected" }, 400);

    const videoSize = file.size;
    const videoBytes = await file.arrayBuffer();

    let token = tokenData.accessToken;
    const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET } = c.env;

    // Refresh TikTok Token if needed
    if (tokenData.refreshToken && TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET) {
      try {
        const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY,
            client_secret: TIKTOK_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: tokenData.refreshToken,
          }),
        });
        const data = await res.json() as any;
        if (data.access_token) token = data.access_token;
      } catch {}
    }

    const fullTitle = `${title} ${hashtags}`.trim();
    let initData: any = null;

    // Try Direct Post first
    try {
      const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: fullTitle.slice(0, 150),
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

      if (initData.error?.code && initData.error.code !== "ok" && initData.error.code !== 0) {
        // Fallback to Inbox/Draft flow
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
      return c.json({ error: `TikTok init exception: ${err.message}` }, 500);
    }

    if (!initData?.data?.upload_url) {
      return c.json({ error: `TikTok init failed: ${initData?.error?.message || "No upload URL"}` }, 500);
    }

    const { upload_url, publish_id } = initData.data;

    // Upload bytes directly
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
      return c.json({ error: `TikTok byte upload failed: HTTP ${uploadRes.status}` }, 500);
    }

    return c.json({
      success: true,
      publishId: publish_id,
      uploadedUrl: `https://www.tiktok.com/publish/${publish_id}`
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /upload/facebook - stream directly to Facebook Page
upload.post("/facebook", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No video file provided" }, 400);
    }

    const title = body.title as string || "";
    const description = body.description as string || "";
    const pageId = body.pageId as string;
    if (!pageId) return c.json({ error: "Facebook Page ID is required" }, 400);

    const tokenData = await getToken(c.env.AUTH_TOKENS, `facebook_page_${pageId}`);
    if (!tokenData) return c.json({ error: `Facebook Page ${pageId} not connected` }, 400);

    const videoSize = file.size;
    const fileData = await file.arrayBuffer();
    const pageToken = tokenData.accessToken;

    // 1. Init upload
    const initRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        upload_phase: "start",
        access_token: pageToken,
        file_size: String(videoSize),
      }),
    });
    const initData = await initRes.json() as any;
    if (!initData.upload_session_id) {
      return c.json({ error: `Facebook init failed: ${initData.error?.message || "No session ID"}` }, 500);
    }

    const sessionId = initData.upload_session_id;

    // 2. Transfer binary file directly
    const formData = new FormData();
    formData.append("upload_phase", "transfer");
    formData.append("access_token", pageToken);
    formData.append("upload_session_id", sessionId);
    formData.append("start_offset", "0");
    formData.append("video_file_chunk", new Blob([fileData], { type: "video/mp4" }), "video.mp4");

    const transferRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
      method: "POST",
      body: formData,
    });
    const transferData = await transferRes.json() as any;
    if (transferData.error) {
      return c.json({ error: `Facebook transfer failed: ${transferData.error.message}` }, 500);
    }

    // 3. Finish upload
    const finishRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        upload_phase: "finish",
        access_token: pageToken,
        upload_session_id: sessionId,
        title: title,
        description: description,
        video_state: "PUBLISHED",
      }),
    });
    const finishData = await finishRes.json() as any;
    if (finishData.error) {
      return c.json({ error: `Facebook finish failed: ${finishData.error.message}` }, 500);
    }

    const videoId = finishData.fb_video_id || initData.video_id;
    return c.json({
      success: true,
      videoId,
      uploadedUrl: `https://facebook.com/${pageId}/videos/${videoId}`
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /upload/instagram - upload Reel to Instagram (uses R2 temporary bucket background only due to API url requirement)
upload.post("/instagram", async (c) => {
  let filename: string | null = null;
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No video file provided" }, 400);
    }

    const caption = body.caption as string || "";

    const tokenData = await getToken(c.env.AUTH_TOKENS, "instagram");
    if (!tokenData || !tokenData.pageId) {
      return c.json({ error: "Instagram Business Account not connected" }, 400);
    }

    const igUserId = tokenData.pageId;
    const userToken = tokenData.accessToken;

    // Instagram Graph API only accepts video URL.
    // We save to R2, get the public URL, upload, and then IMMEDIATELY delete from R2.
    filename = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const bytes = await file.arrayBuffer();

    await c.env.NEX_UPLOADS.put(filename, bytes, {
      httpMetadata: { contentType: "video/mp4" }
    });

    const workerUrl = new URL(c.req.url);
    const publicVideoUrl = `${workerUrl.origin}/files/${filename}`;

    // 1. Create Reels Container
    const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: publicVideoUrl,
        caption: caption,
        access_token: userToken,
      }),
    });
    const containerData = await containerRes.json() as any;
    if (!containerData.id) {
      return c.json({ error: `Instagram Reels container failed: ${containerData.error?.message || "No container ID"}` }, 500);
    }

    const containerId = containerData.id;

    // 2. Poll Reels Container processing status
    let attempts = 0;
    let status = "IN_PROGRESS";
    while (attempts < 15) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const statusRes = await fetch(`https://graph.facebook.com/v19.0/${containerId}?fields=status_code,id&access_token=${userToken}`);
        const statusData = await statusRes.json() as any;
        status = statusData.status_code;
        if (status === "FINISHED") {
          break;
        } else if (status === "ERROR") {
          return c.json({ error: `Instagram video processing failed: ${statusData.error?.message || "Processing error"}` }, 500);
        }
      } catch {}
      attempts++;
    }

    if (status !== "FINISHED") {
      return c.json({ error: "Instagram video processing timed out" }, 500);
    }

    // 3. Publish Reels
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: userToken,
      }),
    });
    const publishData = await publishRes.json() as any;
    if (!publishData.id) {
      return c.json({ error: `Instagram publish failed: ${publishData.error?.message || "Failed to publish"}` }, 500);
    }

    // Immediate cleanup from R2
    if (filename) {
      await c.env.NEX_UPLOADS.delete(filename).catch(() => {});
    }

    return c.json({
      success: true,
      mediaId: publishData.id,
      uploadedUrl: `https://instagram.com/p/${publishData.id}`
    });
  } catch (err: any) {
    // Make sure we cleanup on failure too
    if (filename) {
      await c.env.NEX_UPLOADS.delete(filename).catch(() => {});
    }
    return c.json({ error: err.message }, 500);
  }
});

export default upload;
