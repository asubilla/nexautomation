import { db, monitoredAccountsTable, downloadJobsTable, uploadJobsTable, activityItemsTable, settingsTable } from "@workspace/db";
import { eq, and, inArray, lte, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getLatestVideos, downloadVideo } from "./downloader";
import { uploadVideo } from "./uploader";
import { generateContent } from "./ai-generator";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// ─── Paths ───────────────────────────────────────────────────────────────────
const CLIPPING_DIR = path.resolve("e:/Nex Automation/nex ai clipping");
const PYTHON_EXE = path.join(CLIPPING_DIR, "venv/Scripts/python.exe");
const CLIP_SCRIPT = path.join(CLIPPING_DIR, "clip_video.py");
const CLIPS_OUTPUT_DIR = path.join(CLIPPING_DIR, "clips");

// ─── Scheduler state ─────────────────────────────────────────────────────────
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
let currentIntervalMs = DEFAULT_INTERVAL_MS;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeAccountUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    ["sk", "ref", "fref", "locale", "locale2", "refsrc", "_rdr",
     "igsh", "igshid", "_t", "_r"].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch { return raw; }
}

async function loadIntervalFromDb(): Promise<number> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "check_interval_ms"));
    if (row) { const ms = parseInt(row.value, 10); if (!isNaN(ms) && ms > 0) return ms; }
  } catch {}
  return DEFAULT_INTERVAL_MS;
}

export function setSchedulerInterval(ms: number): void {
  currentIntervalMs = ms;
  logger.info({ ms }, "Scheduler interval updated");
  if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; scheduleNext(); }
}

/**
 * Schedule: 4 clips ek saath ready karo, phir har 6 ghante mein 1 upload
 * Clip 1 → +6h se, Clip 2 → +12h, Clip 3 → +18h, Clip 4 → +24h
 * Sab clips schedule hone ke baad files disk pe rehti hain jab tak upload na ho
 * Upload hone ke baad clip delete, sab ho jaane ke baad folder delete
 */
function assignScheduleSlots(clipCount: number): Date[] {
  const slots: Date[] = [];
  const now = new Date();
  for (let i = 0; i < clipCount; i++) {
    // +6h, +12h, +18h, +24h from now
    slots.push(new Date(now.getTime() + (i + 1) * 6 * 60 * 60 * 1000));
  }
  return slots;
}

// ─── Clipping via Python ──────────────────────────────────────────────────────

function runClippingPipeline(localFilePath: string, outputDir: string): Promise<string[]> {
  return new Promise((resolve) => {
    if (!fs.existsSync(PYTHON_EXE)) {
      logger.warn("Python venv not found — skipping clipping");
      resolve([]);
      return;
    }

    if (!fs.existsSync(localFilePath)) {
      logger.warn({ localFilePath }, "Local video file not found — skipping clipping");
      resolve([]);
      return;
    }

    const args = [
      CLIP_SCRIPT,
      localFilePath,   // ✅ URL ki jagah already downloaded local file path
      "--clips", "4",
      "--min", "15",
      "--max", "90",
      "--style", "clean_white",
      "--random-duration",
      "--output-dir", outputDir,
    ];

    logger.info({ localFilePath, outputDir }, "Starting Python clipping pipeline (local file)");

    const proc = spawn(PYTHON_EXE, args, {
      cwd: CLIPPING_DIR,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
      timeout: 30 * 60 * 1000,
    });

    let resultJson: { success: boolean; clips: string[]; error?: string } | null = null;

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(l => l.trim());
      for (const line of lines) {
        if (line.startsWith("CLIP_RESULT:")) {
          try { resultJson = JSON.parse(line.replace("CLIP_RESULT:", "").trim()); }
          catch { /* ignore */ }
        } else {
          logger.debug({ line }, "Clipping output");
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      logger.debug({ stderr: data.toString().slice(0, 200) }, "Clipping stderr");
    });

    proc.on("close", (code) => {
      if (code === 0 && resultJson?.success && resultJson.clips.length > 0) {
        logger.info({ clips: resultJson.clips }, "Clipping pipeline completed");
        resolve(resultJson.clips);
      } else {
        logger.warn({ code, error: resultJson?.error }, "Clipping pipeline failed or produced no clips");
        resolve([]);
      }
    });

    proc.on("error", (err) => {
      logger.error({ err }, "Failed to spawn clipping process");
      resolve([]);
    });
  });
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function checkAccountForNewVideos(accountId: number): Promise<number> {
  const [account] = await db
    .select()
    .from(monitoredAccountsTable)
    .where(and(eq(monitoredAccountsTable.id, accountId), eq(monitoredAccountsTable.enabled, true)));

  if (!account) return 0;

  try {
    logger.info({ accountId, url: account.url }, "Checking account for latest video");

    // Sirf 1 video fetch karo — top/latest
    const videos = await getLatestVideos(account.url, 1);

    await db.update(monitoredAccountsTable)
      .set({ lastCheckedAt: new Date() })
      .where(eq(monitoredAccountsTable.id, account.id));

    if (videos.length === 0) return 0;

    const latestVideo = videos[0];

    // Agar same video hai jo pehle process ho chuki — skip
    if (account.latestVideoId === latestVideo.id) {
      logger.info({ accountId, videoId: latestVideo.id }, "Same latest video — nothing to do");
      return 0;
    }

    // Check karo koi pending/downloading job already hai is account ke liye
    // Agar hai toh wait karo — pehle wali complete ho jaye
    const activeJobs = await db
      .select({ id: downloadJobsTable.id, status: downloadJobsTable.status })
      .from(downloadJobsTable)
      .where(
        and(
          eq(downloadJobsTable.accountId, account.id),
          inArray(downloadJobsTable.status, ["pending", "downloading"])
        )
      );

    if (activeJobs.length > 0) {
      logger.info({ accountId, activeJobs: activeJobs.length }, "Previous job still in progress — skipping new download");
      return 0;
    }

    // Check karo koi upload job pending/uploading hai is account ke jobs ke liye
    const pendingUploadsForAccount = await db
      .select({ id: uploadJobsTable.id })
      .from(uploadJobsTable)
      .innerJoin(downloadJobsTable, eq(uploadJobsTable.downloadJobId, downloadJobsTable.id))
      .where(
        and(
          eq(downloadJobsTable.accountId, account.id),
          inArray(uploadJobsTable.status, ["pending", "uploading"])
        )
      );

    if (pendingUploadsForAccount.length > 0) {
      logger.info({ accountId, pendingUploads: pendingUploadsForAccount.length }, "Previous uploads still pending — waiting before new download");
      return 0;
    }

    // Naya video hai — sirf yahi ek download karo
    const [job] = await db.insert(downloadJobsTable).values({
      accountId: account.id,
      platform: account.platform,
      username: account.username,
      videoUrl: latestVideo.url,
      videoId: latestVideo.id,
      originalTitle: latestVideo.title,
      thumbnailUrl: latestVideo.thumbnailUrl,
      status: "pending",
    }).returning();

    await db.insert(activityItemsTable).values({
      type: "download_started",
      platform: account.platform,
      username: account.username,
      message: `New latest video: "${latestVideo.title.slice(0, 80)}"`,
    });

    // latestVideoId update karo taaki dobara pick na ho
    await db.update(monitoredAccountsTable)
      .set({ latestVideoId: latestVideo.id, lastVideoAt: new Date() })
      .where(eq(monitoredAccountsTable.id, account.id));

    logger.info({ jobId: job.id, videoId: latestVideo.id, title: latestVideo.title }, "New latest video queued");
    return 1;

  } catch (err: any) {
    logger.error({ err, accountId }, "Error checking account");
    await db.insert(activityItemsTable).values({
      type: "download_failed",
      platform: account.platform,
      username: account.username,
      message: `Failed to check: ${err.message.slice(0, 120)}`,
    });
    return 0;
  }
}

export async function processPendingDownloads(): Promise<void> {
  const pendingJobs = await db
    .select()
    .from(downloadJobsTable)
    .where(inArray(downloadJobsTable.status, ["pending"]))
    .limit(2); // limit to 2 at a time — heavy process

  for (const job of pendingJobs) {
    logger.info({ jobId: job.id }, "Starting download + clip pipeline");

    await db.update(downloadJobsTable)
      .set({ status: "downloading" })
      .where(eq(downloadJobsTable.id, job.id));

    try {
      // 1. Download original video
      const videoId = job.videoId ?? `job-${job.id}`;
      const result = await downloadVideo(job.videoUrl, videoId);

      await db.update(downloadJobsTable)
        .set({
          status: "done",
          localFilePath: result.filePath,
          fileSizeBytes: result.fileSizeBytes,
          originalTitle: job.originalTitle ?? result.title,
          thumbnailUrl: job.thumbnailUrl ?? result.thumbnailUrl,
          completedAt: new Date(),
        })
        .where(eq(downloadJobsTable.id, job.id));

      await db.insert(activityItemsTable).values({
        type: "download_done",
        platform: job.platform,
        username: job.username,
        message: `Downloaded: "${(job.originalTitle ?? result.title).slice(0, 80)}"`,
      });

      logger.info({ jobId: job.id, filePath: result.filePath }, "Download complete");

      // 2. Run clipping pipeline on already-downloaded local file (no double download)
      const clipOutputDir = path.join(CLIPS_OUTPUT_DIR, `job_${job.id}`);
      fs.mkdirSync(clipOutputDir, { recursive: true });

      const clipPaths = await runClippingPipeline(result.filePath, clipOutputDir);

      // 3. Delete original downloaded video to save space
      try {
        if (result.filePath && fs.existsSync(result.filePath)) {
          fs.unlinkSync(result.filePath);
          logger.info({ filePath: result.filePath }, "Original video deleted after clipping");
        }
      } catch { /* ignore */ }

      if (clipPaths.length === 0) {
        logger.warn({ jobId: job.id }, "No clips produced — skipping upload jobs");
        continue;
      }

      // 4. Get upload targets for this account
      const [account] = await db.select().from(monitoredAccountsTable)
        .where(eq(monitoredAccountsTable.id, job.accountId));

      let uploadTargets: string[] = [];
      try { uploadTargets = JSON.parse(account?.uploadTargets ?? "[]"); } catch {}

      if (uploadTargets.length === 0) {
        logger.info({ jobId: job.id }, "No upload targets — clips saved only");
        continue;
      }

      // 5. Create upload jobs: 1 clip per platform per slot (4 clips = 4 slots = 24h)
      // Each clip goes to ALL platforms at the same scheduled time
      const allUploadJobs: { clipPath: string; platform: string }[] = [];
      for (const clipPath of clipPaths) {
        for (const platform of uploadTargets) {
          allUploadJobs.push({ clipPath, platform });
        }
      }

      // Assign schedule slots: clip1→+6h, clip2→+12h, clip3→+18h, clip4→+24h
      const clipSlots = assignScheduleSlots(clipPaths.length);

      for (let i = 0; i < clipPaths.length; i++) {
        const clipPath = clipPaths[i];
        const scheduledAt = clipSlots[i];
        const partNumber = i + 1; // Part 1, 2, 3, 4

        for (const platform of uploadTargets) {
          const content = await generateContent(
            job.originalTitle ?? result.title,
            platform,
            partNumber,
            null,
          );

          await db.insert(uploadJobsTable).values({
            downloadJobId: job.id,
            targetPlatform: platform,
            localClipPath: clipPath,
            aiTitle: content.title,
            aiDescription: content.description,
            aiHashtags: content.hashtags,
            aiTags: JSON.stringify(content.tags),
            aiLocation: content.location ?? null,
            scheduledAt,
            status: "pending",
          } as any);

          logger.info({ jobId: job.id, platform, part: partNumber, scheduledAt }, "Scheduled upload job");
        }
      }

      // Update totalDownloaded
      const [acct] = await db.select({ total: monitoredAccountsTable.totalDownloaded })
        .from(monitoredAccountsTable)
        .where(eq(monitoredAccountsTable.id, job.accountId));
      await db.update(monitoredAccountsTable)
        .set({ totalDownloaded: (acct?.total ?? 0) + 1 })
        .where(eq(monitoredAccountsTable.id, job.accountId));

    } catch (err: any) {
      logger.error({ err, jobId: job.id }, "Download/clip failed");
      await db.update(downloadJobsTable)
        .set({ status: "failed", errorMessage: err.message.slice(0, 300) })
        .where(eq(downloadJobsTable.id, job.id));

      await db.insert(activityItemsTable).values({
        type: "download_failed",
        platform: job.platform,
        username: job.username,
        message: `Failed: ${err.message.slice(0, 100)}`,
      });
    }
  }
}

export async function processPendingUploads(): Promise<void> {
  const now = new Date();

  // Only pick jobs whose scheduledAt <= now (time aa gaya)
  const pendingUploads = await db
    .select()
    .from(uploadJobsTable)
    .where(
      and(
        eq(uploadJobsTable.status, "pending"),
        lte(uploadJobsTable.scheduledAt, now)
      )
    )
    .limit(4); // max 4 at once

  for (const job of pendingUploads) {
    const clipPath = (job as any).localClipPath ?? null;

    if (!clipPath || !fs.existsSync(clipPath)) {
      logger.warn({ uploadJobId: job.id, clipPath }, "Clip file not found — marking failed");
      await db.update(uploadJobsTable)
        .set({ status: "failed", errorMessage: "Clip file not found on disk" })
        .where(eq(uploadJobsTable.id, job.id));
      continue;
    }

    logger.info({ uploadJobId: job.id, platform: job.targetPlatform }, "Starting upload");

    await db.update(uploadJobsTable)
      .set({ status: "uploading" } as any)
      .where(eq(uploadJobsTable.id, job.id));

    const result = await uploadVideo(
      job.targetPlatform,
      clipPath,
      job.aiTitle ?? "Viral Clip",
      job.aiHashtags ?? "",
      (job as any).aiDescription ?? undefined,
      (job as any).aiTags ? JSON.parse((job as any).aiTags) : [],
      job.aiLocation ?? undefined
    );

    if (result.success) {
      await db.update(uploadJobsTable)
        .set({ status: "done", uploadedUrl: result.uploadedUrl, completedAt: new Date() })
        .where(eq(uploadJobsTable.id, job.id));

      await db.insert(activityItemsTable).values({
        type: "upload_done",
        platform: job.targetPlatform,
        message: `Uploaded clip: "${(job.aiTitle ?? "Clip").slice(0, 60)}"`,
        username: null,
      });

      logger.info({ uploadJobId: job.id, url: result.uploadedUrl }, "Upload done");

    } else {
      await db.update(uploadJobsTable)
        .set({ status: "failed", errorMessage: result.errorMessage?.slice(0, 300) })
        .where(eq(uploadJobsTable.id, job.id));

      await db.insert(activityItemsTable).values({
        type: "upload_failed",
        platform: job.targetPlatform,
        message: `Upload failed: ${result.errorMessage?.slice(0, 80)}`,
        username: null,
      });
    }

    // After all platforms for this clip are done/failed → delete clip file
    await deleteClipIfAllUploaded(job.id, clipPath);
  }
}

async function deleteClipIfAllUploaded(uploadJobId: number, clipPath: string): Promise<void> {
  try {
    // Find all upload jobs with same clipPath
    const allForClip = await db
      .select()
      .from(uploadJobsTable)
      .where(eq((uploadJobsTable as any).localClipPath, clipPath));

    const allFinished = allForClip.every(j => j.status === "done" || j.status === "failed");

    if (allFinished && clipPath && fs.existsSync(clipPath)) {
      fs.unlinkSync(clipPath);
      logger.info({ clipPath }, "Clip file deleted after all uploads complete");

      // Also try to delete the clip's parent job-specific dir if empty
      const dir = path.dirname(clipPath);
      try {
        const remaining = fs.readdirSync(dir);
        if (remaining.length === 0) fs.rmdirSync(dir);
      } catch { /* ignore */ }
    }
  } catch (err) {
    logger.warn({ err, clipPath }, "Could not delete clip file");
  }
}

// ─── Scheduler loop ───────────────────────────────────────────────────────────

function scheduleNext(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = setTimeout(async () => {
    logger.info({ intervalMs: currentIntervalMs }, "Scheduler: running check");
    try { await runFullCheck(); }
    catch (err) { logger.error({ err }, "Scheduler error"); }
    scheduleNext();
  }, currentIntervalMs);
}

export async function runFullCheck(): Promise<{ checked: number; newVideos: number }> {
  const accounts = await db
    .select()
    .from(monitoredAccountsTable)
    .where(eq(monitoredAccountsTable.enabled, true));

  let newVideos = 0;
  for (const account of accounts) {
    const count = await checkAccountForNewVideos(account.id);
    newVideos += count;
  }

  await processPendingDownloads();
  await processPendingUploads();

  return { checked: accounts.length, newVideos };
}

export async function startScheduler(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  currentIntervalMs = await loadIntervalFromDb();
  logger.info({ intervalMs: currentIntervalMs }, "Automation scheduler started");

  try {
    // Reset stuck jobs
    await db.update(downloadJobsTable)
      .set({ status: "pending" })
      .where(eq(downloadJobsTable.status, "downloading"));

    await db.update(uploadJobsTable)
      .set({ status: "pending" } as any)
      .where(eq(uploadJobsTable.status, "uploading" as any));

    // Clean account URLs
    const accounts = await db.select().from(monitoredAccountsTable);
    for (const account of accounts) {
      const cleaned = sanitizeAccountUrl(account.url);
      if (cleaned !== account.url) {
        await db.update(monitoredAccountsTable)
          .set({ url: cleaned })
          .where(eq(monitoredAccountsTable.id, account.id));
      }
    }
  } catch (err) {
    logger.warn({ err }, "Could not reset stuck jobs on startup");
  }

  scheduleNext();

  // On startup: process anything already due
  processPendingDownloads().catch(err => logger.error({ err }, "Startup download error"));
  processPendingUploads().catch(err => logger.error({ err }, "Startup upload error"));
}

export function stopScheduler(): void {
  if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
  isRunning = false;
  logger.info("Scheduler stopped");
}
