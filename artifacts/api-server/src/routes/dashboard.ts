import { Router, type IRouter } from "express";
import { eq, count, sql, desc } from "drizzle-orm";
import { db, monitoredAccountsTable, platformCredentialsTable, downloadJobsTable, uploadJobsTable, activityItemsTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    accountStats,
    credentialCount,
    downloadStats,
    uploadStats,
    downloadTodayStats,
    uploadTodayStats,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        active: count(sql`CASE WHEN ${monitoredAccountsTable.enabled} = true THEN 1 END`),
      })
      .from(monitoredAccountsTable),
    db.select({ total: count() }).from(platformCredentialsTable),
    db
      .select({
        total: count(),
        pending: count(sql`CASE WHEN ${downloadJobsTable.status} = 'pending' THEN 1 END`),
        failed: count(sql`CASE WHEN ${downloadJobsTable.status} = 'failed' THEN 1 END`),
      })
      .from(downloadJobsTable),
    db
      .select({
        total: count(),
        failed: count(sql`CASE WHEN ${uploadJobsTable.status} = 'failed' THEN 1 END`),
        pending: count(sql`CASE WHEN ${uploadJobsTable.status} = 'pending' THEN 1 END`),
      })
      .from(uploadJobsTable),
    db
      .select({ total: count() })
      .from(downloadJobsTable)
      .where(sql`${downloadJobsTable.createdAt} >= ${today}`),
    db
      .select({ total: count() })
      .from(uploadJobsTable)
      .where(sql`${uploadJobsTable.createdAt} >= ${today}`),
  ]);

  res.json({
    totalAccounts: Number(accountStats[0]?.total ?? 0),
    activeAccounts: Number(accountStats[0]?.active ?? 0),
    connectedPlatforms: Number(credentialCount[0]?.total ?? 0),
    totalDownloads: Number(downloadStats[0]?.total ?? 0),
    totalUploads: Number(uploadStats[0]?.total ?? 0),
    pendingJobs: Number((downloadStats[0]?.pending ?? 0)) + Number((uploadStats[0]?.pending ?? 0)),
    failedJobs: Number((downloadStats[0]?.failed ?? 0)) + Number((uploadStats[0]?.failed ?? 0)),
    downloadsToday: Number(downloadTodayStats[0]?.total ?? 0),
    uploadsToday: Number(uploadTodayStats[0]?.total ?? 0),
  });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const params = GetRecentActivityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const limit = params.data.limit ?? 20;
  const items = await db
    .select()
    .from(activityItemsTable)
    .orderBy(desc(activityItemsTable.createdAt))
    .limit(limit);
  res.json(items.map(item => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
  })));
});

export default router;
