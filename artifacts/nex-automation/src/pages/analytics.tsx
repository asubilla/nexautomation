import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Download, Upload, CheckCircle2, XCircle, Clock, HardDrive, TrendingUp, BarChart2, Activity, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { formatDistanceToNow, format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAccountAnalytics(id: string) {
  const res = await fetch(`${BASE}/api/analytics/accounts/${id}`);
  if (!res.ok) throw new Error("Failed to load analytics");
  return res.json() as Promise<AccountAnalytics>;
}

interface AccountAnalytics {
  account: {
    id: number; platform: string; username: string; url: string;
    enabled: boolean; uploadTargets: string[]; totalDownloaded: number;
    lastCheckedAt: string | null; lastVideoAt: string | null; createdAt: string;
  };
  downloads: { total: number; done: number; failed: number; downloading: number; pending: number; successRate: number };
  uploads: { total: number; done: number; failed: number; pending: number; successRate: number };
  uploadsByPlatform: { platform: string; total: number; done: number; failed: number }[];
  storage: { totalMb: number; totalGb: number };
  dailyStats: { date: string; downloads: number; uploads: number; uploadsDone: number; uploadsFailed: number }[];
  recentActivity: { id: number; type: string; platform: string; username: string; message: string; createdAt: string }[];
  recentVideos: {
    id: number; videoId: string | null; videoUrl: string; originalTitle: string | null;
    thumbnailUrl: string | null; status: string; fileSizeBytes: number | null;
    errorMessage: string | null; createdAt: string; completedAt: string | null;
    uploads: { platform: string; status: string; aiTitle: string | null; uploadedUrl: string | null; completedAt: string | null }[];
  }[];
}

const PIE_COLORS = ["#00ffc8", "#7c3aed", "#2563eb", "#f59e0b", "#ef4444"];

const STATUS_COLOR: Record<string, string> = {
  done: "text-green-400", failed: "text-red-400",
  downloading: "text-yellow-400", uploading: "text-blue-400", pending: "text-muted-foreground",
};
const STATUS_BG: Record<string, string> = {
  done: "bg-green-400/10 text-green-400 border-green-400/20",
  failed: "bg-red-400/10 text-red-400 border-red-400/20",
  downloading: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  uploading: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  pending: "bg-white/5 text-muted-foreground border-border",
};

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-mono uppercase">{label}</span>
      </div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs font-mono text-muted-foreground">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs font-mono shadow-xl">
      <div className="text-muted-foreground mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }}>●</span>
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-white font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", id],
    queryFn: () => fetchAccountAnalytics(id!),
    refetchInterval: 30_000,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">
        Loading analytics...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/accounts")} className="gap-2 font-mono">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="text-red-400 font-mono">Failed to load analytics.</div>
      </div>
    );
  }

  const { account, downloads, uploads, uploadsByPlatform, storage, dailyStats, recentActivity, recentVideos } = data;

  const pieData = uploadsByPlatform.map(p => ({
    name: p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
    value: p.total,
    done: p.done,
  }));

  const chartData = dailyStats.map(d => ({
    date: format(new Date(d.date), "MMM d"),
    Downloads: d.downloads,
    "Uploads Done": d.uploadsDone,
    "Uploads Failed": d.uploadsFailed,
  }));

  const statusBreakdown = [
    { name: "Done", value: downloads.done, fill: "#22c55e" },
    { name: "Failed", value: downloads.failed, fill: "#ef4444" },
    { name: "Downloading", value: downloads.downloading, fill: "#eab308" },
    { name: "Pending", value: downloads.pending, fill: "#6b7280" },
  ].filter(s => s.value > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/accounts")} className="mt-1 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <PlatformIcon platform={account.platform} className="w-10 h-10" withBackground />
              <div>
                <h1 className="text-2xl font-bold text-white">{account.username}</h1>
                <div className="flex items-center gap-3 mt-1 text-xs font-mono text-muted-foreground">
                  <span className="capitalize">{account.platform}</span>
                  <span>•</span>
                  <span>Added {formatDistanceToNow(new Date(account.createdAt), { addSuffix: true })}</span>
                  {account.lastCheckedAt && (
                    <>
                      <span>•</span>
                      <span>Checked {formatDistanceToNow(new Date(account.lastCheckedAt), { addSuffix: true })}</span>
                    </>
                  )}
                </div>
                {account.uploadTargets.length > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-xs text-muted-foreground font-mono">Uploading to:</span>
                    {account.uploadTargets.map(t => (
                      <PlatformIcon key={t} platform={t} className="w-5 h-5 ml-1" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={account.enabled ? "bg-green-400/10 text-green-400 border-green-400/30" : "bg-white/5 text-muted-foreground border-border"}>
            {account.enabled ? "ACTIVE" : "PAUSED"}
          </Badge>
          <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => refetch()}>
            REFRESH
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Download} label="Total Downloads" value={downloads.total}
          sub={`${downloads.done} successful • ${downloads.failed} failed`} />
        <StatCard icon={Upload} label="Total Uploads" value={uploads.total}
          sub={`${uploads.done} successful • ${uploads.failed} failed`} color="text-violet-400" />
        <StatCard icon={TrendingUp} label="Download Rate" value={`${downloads.successRate}%`}
          sub={`${uploads.successRate}% upload success`}
          color={downloads.successRate >= 80 ? "text-green-400" : downloads.successRate >= 50 ? "text-yellow-400" : "text-red-400"} />
        <StatCard icon={HardDrive} label="Data Downloaded" value={storage.totalMb < 1024 ? `${storage.totalMb} MB` : `${storage.totalGb} GB`}
          sub="from successful downloads" color="text-blue-400" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Activity Chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart2 className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-white">Daily Activity (Last 14 Days)</h2>
          </div>
          {chartData.every(d => d.Downloads === 0 && d["Uploads Done"] === 0) ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground font-mono text-sm">
              No activity yet — trigger a check to start
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }} />
                <Bar dataKey="Downloads" fill="#00ffc8" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="Uploads Done" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="Uploads Failed" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Upload Platform Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-white">Upload Platforms</h2>
          </div>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground font-mono text-sm text-center">
              No uploads yet
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={65} innerRadius={35}
                    dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground capitalize">{p.name}</span>
                    </div>
                    <span className="text-white font-bold">{p.done}/{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Download Status Breakdown + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Download Status */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-bold text-white mb-4 flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" /> Download Status Breakdown
          </h2>
          {statusBreakdown.length === 0 ? (
            <div className="text-muted-foreground font-mono text-sm py-8 text-center">No downloads yet</div>
          ) : (
            <div className="space-y-3">
              {statusBreakdown.map(s => (
                <div key={s.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="text-white font-bold">{s.value}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${downloads.total > 0 ? (s.value / downloads.total) * 100 : 0}%`,
                        background: s.fill,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-border flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">Upload Success Rate</span>
                <span className={uploads.successRate >= 80 ? "text-green-400" : uploads.successRate >= 50 ? "text-yellow-400" : "text-red-400"}>
                  {uploads.successRate}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Recent Activity
          </h2>
          {recentActivity.length === 0 ? (
            <div className="text-muted-foreground font-mono text-sm py-8 text-center">No activity yet</div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {recentActivity.map(a => (
                <div key={a.id} className="flex items-start gap-3 text-xs">
                  <PlatformIcon platform={a.platform} className="w-6 h-6 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-white leading-snug">{a.message}</p>
                    <p className="text-muted-foreground font-mono mt-0.5">
                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Videos Table */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2">
          <Video className="w-4 h-4 text-primary" /> Recent Videos ({recentVideos.length})
        </h2>
        {recentVideos.length === 0 ? (
          <div className="text-muted-foreground font-mono text-sm py-8 text-center">
            No videos yet — trigger a check to start downloading
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-3 pr-4">Title</th>
                  <th className="text-left pb-3 pr-4">Status</th>
                  <th className="text-left pb-3 pr-4">Size</th>
                  <th className="text-left pb-3 pr-4">Uploads</th>
                  <th className="text-left pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentVideos.map(v => (
                  <tr key={v.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4 max-w-[220px]">
                      <a href={v.videoUrl} target="_blank" rel="noreferrer"
                        className="text-white hover:text-primary transition-colors truncate block">
                        {v.originalTitle ?? v.videoId ?? "Unknown"}
                      </a>
                      {v.errorMessage && (
                        <p className="text-red-400 text-[10px] mt-0.5 truncate">{v.errorMessage}</p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase ${STATUS_BG[v.status] ?? STATUS_BG.pending}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {v.fileSizeBytes
                        ? v.fileSizeBytes > 1024 * 1024
                          ? `${(v.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`
                          : `${(v.fileSizeBytes / 1024).toFixed(0)} KB`
                        : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-1 flex-wrap">
                        {v.uploads.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : v.uploads.map((u, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <PlatformIcon platform={u.platform} className="w-4 h-4" />
                            {u.status === "done" ? (
                              <CheckCircle2 className="w-3 h-3 text-green-400" />
                            ) : u.status === "failed" ? (
                              <XCircle className="w-3 h-3 text-red-400" />
                            ) : (
                              <Clock className="w-3 h-3 text-yellow-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
