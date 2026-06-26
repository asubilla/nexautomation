import { Router, type IRouter } from "express";
import { eq, count, sql, desc, and, sum, inArray } from "drizzle-orm";
import { db, monitoredAccountsTable, downloadJobsTable, uploadJobsTable, activityItemsTable, platformCredentialsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/analytics/accounts/:id", async (req, res): Promise<void> => {
  const accountId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(accountId)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [account] = await db
    .select()
    .from(monitoredAccountsTable)
    .where(eq(monitoredAccountsTable.id, accountId));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  // Get upload credentials for this account's target platforms
  const uploadTargetsList: string[] = (() => {
    try { return JSON.parse(account.uploadTargets ?? "[]"); } catch { return []; }
  })();

  const uploadCredentials = uploadTargetsList.length > 0
    ? await db
        .select({
          platform: platformCredentialsTable.platform,
          label: platformCredentialsTable.label,
          isValid: platformCredentialsTable.isValid,
        })
        .from(platformCredentialsTable)
        .where(inArray(platformCredentialsTable.platform, uploadTargetsList))
    : [];

  const downloadIds = db
    .select({ id: downloadJobsTable.id })
    .from(downloadJobsTable)
    .where(eq(downloadJobsTable.accountId, accountId));

  const [
    downloadStats,
    uploadStats,
    uploadByPlatform,
    fileSizeResult,
    recentActivity,
    recentVideos,
    dailyDownloads,
    dailyUploads,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        done: count(sql`CASE WHEN ${downloadJobsTable.status} = 'done' THEN 1 END`),
        failed: count(sql`CASE WHEN ${downloadJobsTable.status} = 'failed' THEN 1 END`),
        downloading: count(sql`CASE WHEN ${downloadJobsTable.status} = 'downloading' THEN 1 END`),
        pending: count(sql`CASE WHEN ${downloadJobsTable.status} = 'pending' THEN 1 END`),
      })
      .from(downloadJobsTable)
      .where(eq(downloadJobsTable.accountId, accountId)),

    db
      .select({
        total: count(),
        done: count(sql`CASE WHEN ${uploadJobsTable.status} = 'done' THEN 1 END`),
        failed: count(sql`CASE WHEN ${uploadJobsTable.status} = 'failed' THEN 1 END`),
        pending: count(sql`CASE WHEN ${uploadJobsTable.status} = 'pending' THEN 1 END`),
        scheduled: count(sql`CASE WHEN ${uploadJobsTable.status} = 'pending' AND ${(uploadJobsTable as any).scheduledAt} IS NOT NULL THEN 1 END`),
      })
      .from(uploadJobsTable)
      .where(sql`${uploadJobsTable.downloadJobId} IN (${downloadIds})`),

    db
      .select({
        platform: uploadJobsTable.targetPlatform,
        total: count(),
        done: count(sql`CASE WHEN ${uploadJobsTable.status} = 'done' THEN 1 END`),
        failed: count(sql`CASE WHEN ${uploadJobsTable.status} = 'failed' THEN 1 END`),
      })
      .from(uploadJobsTable)
      .where(sql`${uploadJobsTable.downloadJobId} IN (${downloadIds})`)
      .groupBy(uploadJobsTable.targetPlatform),

    db
      .select({ totalBytes: sum(downloadJobsTable.fileSizeBytes) })
      .from(downloadJobsTable)
      .where(and(eq(downloadJobsTable.accountId, accountId), eq(downloadJobsTable.status, "done"))),

    db
      .select()
      .from(activityItemsTable)
      .where(
        and(
          eq(activityItemsTable.username, account.username),
          eq(activityItemsTable.platform, account.platform)
        )
      )
      .orderBy(desc(activityItemsTable.createdAt))
      .limit(20),

    db
      .select({
        id: downloadJobsTable.id,
        videoId: downloadJobsTable.videoId,
        videoUrl: downloadJobsTable.videoUrl,
        originalTitle: downloadJobsTable.originalTitle,
        thumbnailUrl: downloadJobsTable.thumbnailUrl,
        status: downloadJobsTable.status,
        fileSizeBytes: downloadJobsTable.fileSizeBytes,
        errorMessage: downloadJobsTable.errorMessage,
        createdAt: downloadJobsTable.createdAt,
        completedAt: downloadJobsTable.completedAt,
      })
      .from(downloadJobsTable)
      .where(eq(downloadJobsTable.accountId, accountId))
      .orderBy(desc(downloadJobsTable.createdAt))
      .limit(30),

    db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS downloads
      FROM download_jobs
      WHERE account_id = ${accountId}
        AND created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at)
    `),

    db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', uj.created_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS uploads,
        COUNT(CASE WHEN uj.status = 'done' THEN 1 END)::int AS uploads_done,
        COUNT(CASE WHEN uj.status = 'failed' THEN 1 END)::int AS uploads_failed
      FROM upload_jobs uj
      JOIN download_jobs dj ON uj.download_job_id = dj.id
      WHERE dj.account_id = ${accountId}
        AND uj.created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE_TRUNC('day', uj.created_at)
      ORDER BY DATE_TRUNC('day', uj.created_at)
    `),
  ]);

  const dl = downloadStats[0];
  const ul = uploadStats[0];
  const totalBytes = Number(fileSizeResult[0]?.totalBytes ?? 0);
  const totalMb = +(totalBytes / (1024 * 1024)).toFixed(2);

  const dlTotal = Number(dl?.total ?? 0);
  const dlDone = Number(dl?.done ?? 0);
  const ulTotal = Number(ul?.total ?? 0);
  const ulDone = Number(ul?.done ?? 0);
  const downloadSuccessRate = dlTotal > 0 ? +((dlDone / dlTotal) * 100).toFixed(1) : 0;
  const uploadSuccessRate = ulTotal > 0 ? +((ulDone / ulTotal) * 100).toFixed(1) : 0;

  const ddMap: Record<string, number> = {};
  for (const row of dailyDownloads.rows as any[]) {
    ddMap[row.date] = Number(row.downloads);
  }
  const duMap: Record<string, { uploads: number; done: number; failed: number }> = {};
  for (const row of dailyUploads.rows as any[]) {
    duMap[row.date] = {
      uploads: Number(row.uploads),
      done: Number(row.uploads_done),
      failed: Number(row.uploads_failed),
    };
  }

  const allDates = new Set([...Object.keys(ddMap), ...Object.keys(duMap)]);
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const allDatesSorted = [...new Set([...last14, ...allDates])].sort();

  const dailyStats = allDatesSorted.map(date => ({
    date,
    downloads: ddMap[date] ?? 0,
    uploads: duMap[date]?.uploads ?? 0,
    uploadsDone: duMap[date]?.done ?? 0,
    uploadsFailed: duMap[date]?.failed ?? 0,
  }));

  const recentVideoIds = recentVideos.map(v => v.id);
  const uploadsByVideo = recentVideoIds.length > 0
    ? await db
        .select({
          downloadJobId: uploadJobsTable.downloadJobId,
          platform: uploadJobsTable.targetPlatform,
          status: uploadJobsTable.status,
          aiTitle: uploadJobsTable.aiTitle,
          aiDescription: (uploadJobsTable as any).aiDescription,
          aiHashtags: uploadJobsTable.aiHashtags,
          aiTags: (uploadJobsTable as any).aiTags,
          aiLocation: uploadJobsTable.aiLocation,
          scheduledAt: (uploadJobsTable as any).scheduledAt,
          uploadedUrl: uploadJobsTable.uploadedUrl,
          createdAt: uploadJobsTable.createdAt,
          completedAt: uploadJobsTable.completedAt,
        })
        .from(uploadJobsTable)
        .where(inArray(uploadJobsTable.downloadJobId, recentVideoIds))
    : [];

  const uploadMap: Record<number, typeof uploadsByVideo> = {};
  for (const u of uploadsByVideo) {
    if (!uploadMap[u.downloadJobId]) uploadMap[u.downloadJobId] = [];
    uploadMap[u.downloadJobId].push(u);
  }

  res.json({
    account: {
      ...account,
      uploadTargets: uploadTargetsList,
      uploadCredentials: uploadCredentials.map(c => ({
        platform: c.platform,
        username: c.label,
        isValid: c.isValid,
      })),
      lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
      lastVideoAt: account.lastVideoAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
    },
    downloads: {
      total: dlTotal,
      done: dlDone,
      failed: Number(dl?.failed ?? 0),
      downloading: Number(dl?.downloading ?? 0),
      pending: Number(dl?.pending ?? 0),
      successRate: downloadSuccessRate,
    },
    uploads: {
      total: ulTotal,
      done: ulDone,
      failed: Number(ul?.failed ?? 0),
      pending: Number(ul?.pending ?? 0),
      scheduled: Number((ul as any)?.scheduled ?? 0),
      successRate: uploadSuccessRate,
    },
    uploadsByPlatform: uploadByPlatform.map(p => ({
      platform: p.platform,
      total: Number(p.total),
      done: Number(p.done),
      failed: Number(p.failed),
    })),
    storage: {
      totalMb,
      totalGb: +(totalMb / 1024).toFixed(3),
    },
    dailyStats,
    recentActivity: recentActivity.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    recentVideos: recentVideos.map(v => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
      completedAt: v.completedAt?.toISOString() ?? null,
      uploads: (uploadMap[v.id] ?? []).map(u => ({
        ...u,
        scheduledAt: (u as any).scheduledAt ? new Date((u as any).scheduledAt).toISOString() : null,
        createdAt: u.createdAt.toISOString(),
        completedAt: u.completedAt?.toISOString() ?? null,
      })),
    })),
  });
});

export default router;
