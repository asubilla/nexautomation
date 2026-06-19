import { Router, type IRouter } from "express";
import { eq, desc, and, isNull } from "drizzle-orm";
import { db, downloadJobsTable, uploadJobsTable, activityItemsTable, monitoredAccountsTable } from "@workspace/db";
import {
  ListDownloadJobsQueryParams,
  ListUploadJobsQueryParams,
  RetryUploadJobParams,
  TriggerCheckBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatDownloadJob(job: typeof downloadJobsTable.$inferSelect) {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function formatUploadJob(job: typeof uploadJobsTable.$inferSelect) {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

router.get("/jobs/downloads", async (req, res): Promise<void> => {
  const params = ListDownloadJobsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { status, limit } = params.data;
  let query = db
    .select()
    .from(downloadJobsTable)
    .orderBy(desc(downloadJobsTable.createdAt))
    .$dynamic();

  if (status) {
    query = query.where(eq(downloadJobsTable.status, status));
  }
  if (limit) {
    query = query.limit(limit);
  }

  const jobs = await query;
  res.json(jobs.map(formatDownloadJob));
});

router.get("/jobs/uploads", async (req, res): Promise<void> => {
  const params = ListUploadJobsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { status, limit } = params.data;
  let query = db
    .select()
    .from(uploadJobsTable)
    .orderBy(desc(uploadJobsTable.createdAt))
    .$dynamic();

  if (status) {
    query = query.where(eq(uploadJobsTable.status, status));
  }
  if (limit) {
    query = query.limit(limit);
  }

  const jobs = await query;
  res.json(jobs.map(formatUploadJob));
});

router.post("/jobs/uploads/:id/retry", async (req, res): Promise<void> => {
  const params = RetryUploadJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [job] = await db
    .update(uploadJobsTable)
    .set({ status: "pending", errorMessage: null, completedAt: null })
    .where(eq(uploadJobsTable.id, params.data.id))
    .returning();
  if (!job) {
    res.status(404).json({ error: "Upload job not found" });
    return;
  }
  res.json(formatUploadJob(job));
});

router.post("/jobs/trigger", async (req, res): Promise<void> => {
  const parsed = TriggerCheckBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountId } = parsed.data;

  let accounts;
  if (accountId != null) {
    accounts = await db
      .select()
      .from(monitoredAccountsTable)
      .where(and(eq(monitoredAccountsTable.id, accountId), eq(monitoredAccountsTable.enabled, true)));
  } else {
    accounts = await db
      .select()
      .from(monitoredAccountsTable)
      .where(eq(monitoredAccountsTable.enabled, true));
  }

  const now = new Date();
  let jobsCreated = 0;

  for (const account of accounts) {
    await db
      .update(monitoredAccountsTable)
      .set({ lastCheckedAt: now })
      .where(eq(monitoredAccountsTable.id, account.id));

    // Simulate finding a new video (in production this would call the platform APIs)
    const fakeVideoUrl = `https://${account.platform}.com/watch?v=${Math.random().toString(36).slice(2, 10)}`;
    const [downloadJob] = await db
      .insert(downloadJobsTable)
      .values({
        accountId: account.id,
        platform: account.platform,
        username: account.username,
        videoUrl: fakeVideoUrl,
        originalTitle: `New video from ${account.username}`,
        status: "pending",
      })
      .returning();

    await db.insert(uploadJobsTable).values({
      downloadJobId: downloadJob.id,
      targetPlatform: account.platform === "youtube" ? "tiktok" : "youtube",
      status: "pending",
    });

    await db.insert(activityItemsTable).values({
      type: "download_started",
      platform: account.platform,
      username: account.username,
      message: `New video detected from @${account.username} on ${account.platform}`,
    });

    jobsCreated++;
  }

  res.json({ checked: accounts.length, newVideosFound: jobsCreated, jobsCreated });
});

export default router;
