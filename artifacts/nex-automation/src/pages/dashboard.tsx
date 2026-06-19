import { useGetDashboardStats, useGetRecentActivity, useTriggerCheck, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Download, Upload, Users, Play, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ limit: 10 });
  const triggerCheck = useTriggerCheck();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleTrigger = () => {
    triggerCheck.mutate({ data: {} }, {
      onSuccess: (result) => {
        toast({
          title: "Check Triggered",
          description: `Checked ${result.checked} accounts, found ${result.newVideosFound} new videos, created ${result.jobsCreated} jobs.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      },
      onError: () => {
        toast({
          title: "Trigger Failed",
          description: "Could not trigger check.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">System overview and real-time activity.</p>
        </div>
        <Button 
          onClick={handleTrigger} 
          disabled={triggerCheck.isPending}
          className="gap-2 font-mono"
        >
          <Play className="w-4 h-4" />
          {triggerCheck.isPending ? "RUNNING..." : "TRIGGER CHECK"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Monitored Accounts" 
          value={stats?.totalAccounts} 
          subtitle={`${stats?.activeAccounts || 0} active`}
          icon={Users} 
          loading={statsLoading} 
        />
        <StatCard 
          title="Downloads Today" 
          value={stats?.downloadsToday} 
          subtitle={`${stats?.totalDownloads || 0} total`}
          icon={Download} 
          loading={statsLoading} 
        />
        <StatCard 
          title="Uploads Today" 
          value={stats?.uploadsToday} 
          subtitle={`${stats?.totalUploads || 0} total`}
          icon={Upload} 
          loading={statsLoading} 
        />
        <StatCard 
          title="Pending Jobs" 
          value={stats?.pendingJobs} 
          subtitle={`${stats?.failedJobs || 0} failed`}
          icon={RefreshCw} 
          loading={statsLoading} 
          alert={stats?.failedJobs ? true : false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold text-white">Activity Feed</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {activityLoading ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">Loading activity...</div>
            ) : activity && activity.length > 0 ? (
              <div className="divide-y divide-border">
                {activity.map((item) => (
                  <div key={item.id} className="p-4 flex items-start gap-4 hover:bg-white/[0.02] transition-colors">
                    <PlatformIcon platform={item.platform} className="w-8 h-8 flex-shrink-0" withBackground />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="font-semibold text-white">{item.username || item.platform}</span>
                        {" "}- {item.message}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">No recent activity.</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">System Status</h2>
          <div className="bg-card border border-border rounded-lg p-6 space-y-6">
             <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-mono">Status</span>
                <span className="text-green-500 font-mono text-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  ONLINE
                </span>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-mono">Connected Platforms</span>
                <span className="text-white font-mono text-sm">{stats?.connectedPlatforms || 0} / 4</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, loading, alert }: any) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 relative overflow-hidden">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-mono text-muted-foreground">{title}</p>
          {loading ? (
            <div className="h-10 w-24 bg-white/5 animate-pulse rounded mt-2" />
          ) : (
            <h3 className="text-3xl font-bold text-white mt-1">{value !== undefined ? value : "-"}</h3>
          )}
          {subtitle && !loading && (
            <p className={cn("text-xs mt-2 font-mono", alert ? "text-red-500" : "text-muted-foreground")}>
              {subtitle}
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-md", alert ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary")}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {alert && (
        <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/20 blur-2xl rounded-full" />
      )}
    </div>
  );
}
