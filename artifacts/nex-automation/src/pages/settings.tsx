import { useState, useEffect } from "react";
import { useHealthCheck } from "@workspace/api-client-react";
import { CheckCircle2, AlertTriangle, Clock, Zap, Database, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const INTERVAL_PRESETS = [
  { label: "5 sec", ms: 5_000 },
  { label: "10 sec", ms: 10_000 },
  { label: "15 sec", ms: 15_000 },
  { label: "30 sec", ms: 30_000 },
  { label: "1 min", ms: 60_000 },
  { label: "10 min", ms: 10 * 60_000 },
  { label: "15 min", ms: 15 * 60_000 },
  { label: "30 min", ms: 30 * 60_000 },
];

function msToLabel(ms: number): string {
  const preset = INTERVAL_PRESETS.find(p => p.ms === ms);
  if (preset) return preset.label;
  if (ms < 60_000) return `${ms / 1000} sec`;
  return `${ms / 60_000} min`;
}

async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

async function patchSettings(values: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

export default function Settings() {
  const { data: health, isLoading: healthLoading } = useHealthCheck();
  const { toast } = useToast();

  const [currentMs, setCurrentMs] = useState<number>(15 * 60_000);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then(s => {
        const ms = parseInt(s["check_interval_ms"] ?? "", 10);
        if (!isNaN(ms)) setCurrentMs(ms);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSelect = async (ms: number) => {
    if (ms === currentMs) return;
    setSaving(true);
    try {
      await patchSettings({ check_interval_ms: String(ms) });
      setCurrentMs(ms);
      toast({
        title: "Check interval updated",
        description: `Backend ab har ${msToLabel(ms)} mein videos check karega.`,
      });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClearJobs = async () => {
    if (!confirm("Completed job logs clear karne hain? Downloaded files aur credentials safe rahenge.")) return;
    try {
      await fetch("/api/jobs/downloads?status=done", { method: "DELETE" }).catch(() => {});
      toast({ title: "Cache cleared", description: "Completed jobs removed." });
    } catch {
      toast({ title: "Failed to clear cache", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">System Settings</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          Automation intervals, system health, and preferences.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Check Interval */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Check Interval</h2>
              <p className="text-xs text-muted-foreground font-mono">
                Backend har itni der baad sabke accounts ki nayi videos check karega.
              </p>
            </div>
          </div>

          {!loaded ? (
            <div className="mt-4 text-muted-foreground font-mono text-sm">Loading...</div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {INTERVAL_PRESETS.map((preset) => {
                  const active = currentMs === preset.ms;
                  return (
                    <button
                      key={preset.ms}
                      onClick={() => handleSelect(preset.ms)}
                      disabled={saving}
                      className={`
                        relative flex flex-col items-center justify-center p-3 rounded-lg border text-sm font-mono transition-all
                        ${active
                          ? "border-primary bg-primary/15 text-primary shadow-[0_0_12px_rgba(0,255,200,0.15)]"
                          : "border-border bg-white/[0.03] text-muted-foreground hover:border-muted-foreground hover:text-white"
                        }
                        ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                      `}
                    >
                      {active && (
                        <Check className="absolute top-1.5 right-1.5 w-3 h-3 text-primary" />
                      )}
                      <span className="text-base font-bold">{preset.label.split(" ")[0]}</span>
                      <span className="text-[10px] opacity-70">{preset.label.split(" ")[1]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 border border-border">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-mono text-muted-foreground">
                  Current interval: <span className="text-white font-bold">{msToLabel(currentMs)}</span>
                  {" "}— backend ab isey follow kar raha hai
                </span>
              </div>
            </>
          )}
        </div>

        {/* System Health */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Zap className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">System Health</h2>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-md bg-white/5">
              <span className="font-mono text-sm text-muted-foreground">API Server</span>
              {healthLoading ? (
                <span className="font-mono text-sm text-yellow-500">CHECKING...</span>
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
            <div className="flex items-center justify-between p-3 rounded-md bg-white/5">
              <span className="font-mono text-sm text-muted-foreground">AI Model</span>
              <span className="font-mono text-sm text-white">Groq — Llama 3.3 70B</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md bg-white/5">
              <span className="font-mono text-sm text-muted-foreground">Downloader</span>
              <span className="font-mono text-sm text-white">yt-dlp 2026.06.09</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md bg-white/5">
              <span className="font-mono text-sm text-muted-foreground">Concurrent Downloads</span>
              <span className="font-mono text-sm text-white">3 parallel</span>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-card border border-destructive/20 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-md bg-destructive/10 text-destructive">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Data Management</h2>
          </div>
          <p className="text-sm text-muted-foreground font-mono mb-4">
            Completed job logs clear karo. Downloaded files aur credentials safe rahenge.
          </p>
          <Button variant="destructive" className="font-mono" onClick={handleClearJobs}>
            CLEAR JOB CACHE
          </Button>
        </div>
      </div>
    </div>
  );
}
