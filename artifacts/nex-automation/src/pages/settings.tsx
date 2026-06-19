import { useHealthCheck } from "@workspace/api-client-react";
import { CheckCircle2, AlertTriangle, Shield, Zap, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Settings() {
  const { data: health, isLoading } = useHealthCheck();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">System Settings</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">Global automation preferences and system health.</p>
      </div>

      <div className="grid gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Shield className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">System Health</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-white/5">
              <span className="font-mono text-sm text-muted-foreground">API Connection</span>
              {isLoading ? (
                <span className="font-mono text-sm text-yellow-500 flex items-center gap-2">CHECKING...</span>
              ) : health?.status === "ok" ? (
                <span className="font-mono text-sm text-green-500 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> HEALTHY
                </span>
              ) : (
                <span className="font-mono text-sm text-red-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> DEGRADED
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Zap className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Automation Limits</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground uppercase">Concurrent Downloads</label>
              <div className="text-white font-mono bg-white/5 p-3 rounded-md">3 (Fixed in current tier)</div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground uppercase">AI Generation Model</label>
              <div className="text-white font-mono bg-white/5 p-3 rounded-md">GPT-4o (Optimized for social)</div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-destructive/20 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-md bg-destructive/10 text-destructive">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Data Management</h2>
          </div>
          <p className="text-sm text-muted-foreground font-mono mb-4">
            Clearing cache will remove completed job logs. It will not delete downloaded media or connected credentials.
          </p>
          <Button variant="destructive" className="font-mono">CLEAR JOB CACHE</Button>
        </div>
      </div>
    </div>
  );
}
