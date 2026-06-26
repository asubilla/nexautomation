import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, downloadJobsTable, uploadJobsTable, activityItemsTable, monitoredAccountsTable } from "@workspace/db";
import {
  ListDownloadJobsQueryParams,
  ListUploadJobsQueryParams,
  RetryUploadJobParams,
  TriggerCheckBody,
} from "@workspace/api-zod";
import { checkAccountForNewVideos, runFullCheck, processPendingDownloads, processPendingUploads } from "../services/scheduler";

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
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
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

  processPendingUploads().catch(() => {});
  res.json(formatUploadJob(job));
});

router.post("/jobs/downloads/retry-failed", async (_req, res): Promise<void> => {
  const updated = await db
    .update(downloadJobsTable)
    .set({ status: "pending", errorMessage: null })
    .where(eq(downloadJobsTable.status, "failed"))
    .returning({ id: downloadJobsTable.id });
  processPendingDownloads().catch(() => {});
  res.json({ reset: updated.length, message: `${updated.length} failed download jobs reset to pending` });
});

router.post("/jobs/trigger", async (req, res): Promise<void> => {
  const parsed = TriggerCheckBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountId } = parsed.data;

  res.json({ status: "started", message: "Check initiated in background" });

  setImmediate(async () => {
    try {
      if (accountId != null) {
        const newVideos = await checkAccountForNewVideos(accountId);
        if (newVideos > 0) {
          await processPendingDownloads();
          await processPendingUploads();
        }
      } else {
        await runFullCheck();
      }
    } catch (err) {
      req.log?.error({ err }, "Trigger check error");
    }
  });
});

export default router;
