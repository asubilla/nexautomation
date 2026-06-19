import { db, monitoredAccountsTable, downloadJobsTable, uploadJobsTable, activityItemsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getLatestVideos, downloadVideo } from "./downloader";
import { uploadVideo } from "./uploader";
import { generateContent } from "./ai-generator";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

export async function checkAccountForNewVideos(accountId: number): Promise<number> {
  const [account] = await db
    .select()
    .from(monitoredAccountsTable)
    .where(and(eq(monitoredAccountsTable.id, accountId), eq(monitoredAccountsTable.enabled, true)));

  if (!account) return 0;

  let newCount = 0;

  try {
    logger.info({ accountId, url: account.url }, "Checking account for new videos");

    const videos = await getLatestVideos(account.url, 5);

    await db
      .update(monitoredAccountsTable)
      .set({ lastCheckedAt: new Date() })
      .where(eq(monitoredAccountsTable.id, account.id));

    if (videos.length === 0) return 0;

    const latestVideo = videos[0];

    if (account.latestVideoId === latestVideo.id) {
      logger.info({ accountId, videoId: latestVideo.id }, "No new videos found");
      return 0;
    }

    const existingJobs = await db
      .select({ videoId: downloadJobsTable.videoId })
      .from(downloadJobsTable)
      .where(eq(downloadJobsTable.accountId, account.id));

    const existingVideoIds = new Set(existingJobs.map(j => j.videoId).filter(Boolean));

    for (const video of videos) {
      if (existingVideoIds.has(video.id)) continue;

      const [job] = await db
        .insert(downloadJobsTable)
        .values({
          accountId: account.id,
          platform: account.platform,
          username: account.username,
          videoUrl: video.url,
          videoId: video.id,
          originalTitle: video.title,
          thumbnailUrl: video.thumbnailUrl,
          status: "pending",
        })
        .returning();

      await db.insert(activityItemsTable).values({
        type: "download_started",
        platform: account.platform,
        username: account.username,
        message: `New video detected: "${video.title.slice(0, 80)}"`,
      });

      logger.info({ jobId: job.id, videoId: video.id, title: video.title }, "Created download job");
      newCount++;
    }

    await db
      .update(monitoredAccountsTable)
      .set({ latestVideoId: latestVideo.id, lastVideoAt: new Date() })
      .where(eq(monitoredAccountsTable.id, account.id));

  } catch (err: any) {
    logger.error({ err, accountId }, "Error checking account for new videos");

    await db.insert(activityItemsTable).values({
      type: "download_failed",
      platform: account.platform,
      username: account.username,
      message: `Failed to check for new videos: ${err.message.slice(0, 120)}`,
    });
  }

  return newCount;
}

export async function processPendingDownloads(): Promise<void> {
  const pendingJobs = await db
    .select()
    .from(downloadJobsTable)
    .where(inArray(downloadJobsTable.status, ["pending"]))
    .limit(3);

  for (const job of pendingJobs) {
    logger.info({ jobId: job.id, videoUrl: job.videoUrl }, "Starting download");

    await db
      .update(downloadJobsTable)
      .set({ status: "downloading" })
      .where(eq(downloadJobsTable.id, job.id));

    try {
      const videoId = job.videoId ?? `job-${job.id}`;
      const result = await downloadVideo(job.videoUrl, videoId);

      await db
        .update(downloadJobsTable)
        .set({
          status: "done",
          localFilePath: result.filePath,
          fileSizeBytes: result.fileSizeBytes,
          originalTitle: job.originalTitle ?? result.title,
          thumbnailUrl: job.thumbnailUrl ?? result.thumbnailUrl,
          completedAt: new Date(),
        })
        .where(eq(downloadJobsTable.id, job.id));

      await db
        .update(monitoredAccountsTable)
        .set({ totalDownloaded: (await db.select({ total: monitoredAccountsTable.totalDownloaded }).from(monitoredAccountsTable).where(eq(monitoredAccountsTable.id, job.accountId)))[0]?.total + 1 || 1 })
        .where(eq(monitoredAccountsTable.id, job.accountId));

      await db.insert(activityItemsTable).values({
        type: "download_done",
        platform: job.platform,
        username: job.username,
        message: `Downloaded: "${(job.originalTitle ?? result.title).slice(0, 80)}"`,
      });

      logger.info({ jobId: job.id, filePath: result.filePath }, "Download completed");

      const [account] = await db
        .select()
        .from(monitoredAccountsTable)
        .where(eq(monitoredAccountsTable.id, job.accountId));

      if (account) {
        let uploadTargets: string[] = [];
        try {
          uploadTargets = JSON.parse(account.uploadTargets ?? "[]");
        } catch {
          uploadTargets = [];
        }

        for (const targetPlatform of uploadTargets) {
          const generated = generateContent(job.originalTitle ?? result.title, targetPlatform);
          await db.insert(uploadJobsTable).values({
            downloadJobId: job.id,
            targetPlatform,
            aiTitle: generated.title,
            aiHashtags: generated.hashtags,
            status: "pending",
          });

          logger.info({ jobId: job.id, targetPlatform }, "Created upload job");
        }
      }

    } catch (err: any) {
      logger.error({ err, jobId: job.id }, "Download failed");

      await db
        .update(downloadJobsTable)
        .set({ status: "failed", errorMessage: err.message.slice(0, 300) })
        .where(eq(downloadJobsTable.id, job.id));

      await db.insert(activityItemsTable).values({
        type: "download_failed",
        platform: job.platform,
        username: job.username,
        message: `Download failed: ${err.message.slice(0, 100)}`,
      });
    }
  }
}

export async function processPendingUploads(): Promise<void> {
  const pendingUploads = await db
    .select()
    .from(uploadJobsTable)
    .where(eq(uploadJobsTable.status, "pending"))
    .limit(3);

  for (const job of pendingUploads) {
    const [downloadJob] = await db
      .select()
      .from(downloadJobsTable)
      .where(eq(downloadJobsTable.id, job.downloadJobId));

    if (!downloadJob || downloadJob.status !== "done" || !downloadJob.localFilePath) {
      continue;
    }

    logger.info({ uploadJobId: job.id, platform: job.targetPlatform }, "Starting upload");

    await db
      .update(uploadJobsTable)
      .set({ status: "uploading" } as any)
      .where(eq(uploadJobsTable.id, job.id));

    const result = await uploadVideo(
      job.targetPlatform,
      downloadJob.localFilePath,
      job.aiTitle ?? downloadJob.originalTitle ?? "Video",
      job.aiHashtags ?? ""
    );

    if (result.success) {
      await db
        .update(uploadJobsTable)
        .set({ status: "done", uploadedUrl: result.uploadedUrl, completedAt: new Date() })
        .where(eq(uploadJobsTable.id, job.id));

      await db.insert(activityItemsTable).values({
        type: "upload_done",
        platform: job.targetPlatform,
        username: downloadJob.username,
        message: `Uploaded to ${job.targetPlatform}: "${(job.aiTitle ?? "Video").slice(0, 60)}"`,
      });

      logger.info({ uploadJobId: job.id, uploadedUrl: result.uploadedUrl }, "Upload completed");
    } else {
      await db
        .update(uploadJobsTable)
        .set({ status: "failed", errorMessage: result.errorMessage?.slice(0, 300) })
        .where(eq(uploadJobsTable.id, job.id));

      await db.insert(activityItemsTable).values({
        type: "upload_failed",
        platform: job.targetPlatform,
        username: downloadJob.username,
        message: `Upload failed to ${job.targetPlatform}: ${result.errorMessage?.slice(0, 80)}`,
      });

      logger.warn({ uploadJobId: job.id, error: result.errorMessage }, "Upload failed");
    }
  }
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

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (schedulerTimer) return;

  logger.info("Automation scheduler started (15-minute interval)");

  schedulerTimer = setInterval(async () => {
    logger.info("Scheduler: running full automation check");
    try {
      const result = await runFullCheck();
      logger.info(result, "Scheduler: check complete");
    } catch (err) {
      logger.error({ err }, "Scheduler: error during check");
    }
  }, CHECK_INTERVAL_MS);

  processPendingDownloads().catch(err => logger.error({ err }, "Startup: pending download error"));
  processPendingUploads().catch(err => logger.error({ err }, "Startup: pending upload error"));
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("Scheduler stopped");
  }
}
