/**
 * AI Clipping — Campaign Manager
 *
 * Ek baar channel URL dalo + upload platform login karo
 * → Scheduler automatically latest video detect karega
 * → Download → Clip (4 clips, 15-90s, captions) → Schedule (har 6h 1 clip) → Upload → Delete
 * → Hamesha chalta rahega jab tak khud pause na karo
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListAccounts, useCreateAccount, useUpdateAccount,
  useDeleteAccount, useCreateCredential, useListCredentials,
  getListAccountsQueryKey, useTriggerCheck,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Scissors, Plus, Trash2, ExternalLink, BarChart2,
  Play, Pause, Zap, RefreshCw, Info, CheckCircle2,
  Clock, Upload, AlertTriangle, Loader2, Key, Lock,
  Download, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;
type Platform = typeof PLATFORMS[number];
const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
};

// Source platforms that need credentials for download scraping
const SOURCE_CRED_REQUIRED: Partial<Record<Platform, string>> = {
  tiktok: "TikTok email / @username",
  instagram: "Instagram username / email",
  facebook: "Facebook email / phone",
};

const PENDING_CAMPAIGN_KEY = "nex_pending_campaign";

export default function Clipping() {
  const { data: accounts, isLoading } = useListAccounts();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const triggerCheck = useTriggerCheck();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingResume, setPendingResume] = useState<string | null>(null);

  // Detect YouTube OAuth callback → resume pending campaign
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("youtube_connected") === "true") {
      const saved = localStorage.getItem(PENDING_CAMPAIGN_KEY);
      if (saved) {
        setPendingResume(saved);
        setAddOpen(true);
      } else {
        toast({ title: "YouTube Connected!", description: "You can now create a campaign." });
      }
      // Remove query param from URL without reload
      window.history.replaceState({}, "", "/clipping");
    }
    if (params.get("youtube_error")) {
      toast({ title: "YouTube connect failed", description: params.get("youtube_error") ?? "", variant: "destructive" });
      window.history.replaceState({}, "", "/clipping");
    }
  }, []);

  // Only show accounts that have clipping-relevant setup
  const campaigns = Array.isArray(accounts) ? accounts : [];

  const handleToggle = (id: number, enabled: boolean) => {
    updateAccount.mutate({ id, data: { enabled: !enabled } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        toast({ title: enabled ? "Campaign paused" : "Campaign resumed — will run on next check" });
      },
    });
  };

  const handleDelete = (id: number, username: string) => {
    if (!confirm(`Remove campaign for @${username}? All jobs will be deleted.`)) return;
    deleteAccount.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        toast({ title: "Campaign removed" });
      },
    });
  };

  const handleTriggerNow = (accountId: number, username: string) => {
    triggerCheck.mutate({ data: { accountId } as any }, {
      onSuccess: () => {
        toast({ title: `Checking @${username} now...`, description: "New video check started" });
        setTimeout(() => queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }), 3000);
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Scissors className="w-7 h-7 text-primary" />
            AI Clipping Campaigns
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm max-w-xl">
            Channel URL ek baar dalo → har naya video automatically clip hoga →
            4 clips har 6 ghante schedule pe upload → sab delete. Always on.
          </p>
        </div>
        <Button className="gap-2 font-mono" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" /> NEW CAMPAIGN
        </Button>
      </div>

      {/* How it works */}
      {campaigns.length === 0 && !isLoading && (
        <div className="bg-card border border-primary/20 rounded-xl p-6 space-y-4">
          <h2 className="text-white font-bold flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" /> Kaise kaam karta hai?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: "1", title: "Channel URL", desc: "Kisi bhi YouTube/TikTok/Instagram/Facebook channel ka link" },
              { step: "2", title: "Source Login", desc: "Non-YouTube sources ke liye download credentials (agar private/restricted ho)" },
              { step: "3", title: "Upload Platform", desc: "Select karo kahan clips upload honi chahiye + login karo" },
              { step: "4", title: "Auto Schedule", desc: "Har 6 ghante 1 clip upload → done → sab delete → repeat" },
            ].map(item => (
              <div key={item.step} className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                  {item.step}
                </span>
                <div>
                  <p className="text-white font-semibold text-sm">{item.title}</p>
                  <p className="text-muted-foreground text-xs font-mono mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Button className="gap-2 font-mono w-full mt-2" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> START FIRST CAMPAIGN
          </Button>
        </div>
      )}

      {/* Active campaigns */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground font-mono">Loading campaigns...</div>
      ) : campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map(account => {
            const uploadTargets: string[] = Array.isArray((account as any).uploadTargets)
              ? (account as any).uploadTargets : [];

            return (
              <div key={account.id} className={cn(
                "bg-card border rounded-xl p-5 transition-all",
                account.enabled ? "border-primary/30" : "border-border opacity-70"
              )}>
                <div className="flex items-start justify-between gap-4">
                  {/* Left: channel info */}
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <PlatformIcon platform={account.platform} className="w-12 h-12" withBackground />
                      <span className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card",
                        account.enabled ? "bg-green-500" : "bg-gray-500"
                      )} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-white text-lg">@{account.username}</h3>
                        <span className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase",
                          account.enabled
                            ? "text-green-400 border-green-400/30 bg-green-400/10"
                            : "text-muted-foreground border-border bg-white/5"
                        )}>
                          {account.enabled ? "ACTIVE" : "PAUSED"}
                        </span>
                        <a href={account.url} target="_blank" rel="noreferrer"
                          className="text-muted-foreground hover:text-primary">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs font-mono text-muted-foreground">
                        <span className="capitalize">{account.platform}</span>
                        <span>•</span>
                        <span>Clips made: <span className="text-white font-bold">{account.totalDownloaded || 0}</span></span>
                        {account.lastCheckedAt ? (
                          <>
                            <span>•</span>
                            <span>Last check: <span className="text-white">{formatDistanceToNow(new Date(account.lastCheckedAt), { addSuffix: true })}</span></span>
                          </>
                        ) : (
                          <>
                            <span>•</span>
                            <span className="text-yellow-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Not checked yet — click
                              <Zap className="w-3 h-3" /> to trigger
                            </span>
                          </>
                        )}
                        {account.lastVideoAt && (
                          <>
                            <span>•</span>
                            <span>Last video: <span className="text-white">{formatDistanceToNow(new Date(account.lastVideoAt), { addSuffix: true })}</span></span>
                          </>
                        )}
                      </div>

                      {/* Upload targets */}
                      {uploadTargets.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-mono">Auto-upload to:</span>
                          {uploadTargets.map(t => (
                            <div key={t} className="flex items-center gap-1 bg-white/5 border border-border rounded-md px-2 py-0.5">
                              <PlatformIcon platform={t} className="w-3.5 h-3.5" />
                              <span className="text-xs font-mono text-white capitalize">{PLATFORM_LABELS[t as Platform] ?? t}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Schedule info */}
                      {uploadTargets.length > 0 && account.enabled && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs font-mono text-muted-foreground">
                          <Clock className="w-3 h-3 text-primary" />
                          <span>4 clips → Part 1 +6h, Part 2 +12h, Part 3 +18h, Part 4 +24h → delete</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      title="Check for new video now"
                      disabled={triggerCheck.isPending}
                      onClick={() => handleTriggerNow(account.id, account.username)}
                      className="text-primary hover:bg-primary/10 border border-primary/20"
                    >
                      <Zap className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="ghost" size="sm"
                      className="gap-1.5 font-mono text-xs text-primary hover:bg-primary/10 border border-primary/20"
                      onClick={() => navigate(`/analytics/${account.id}`)}>
                      <BarChart2 className="w-3.5 h-3.5" /> ANALYTICS
                    </Button>

                    <Button
                      variant={account.enabled ? "outline" : "default"}
                      size="sm"
                      className={cn("gap-1.5 font-mono text-xs", !account.enabled && "bg-green-600 hover:bg-green-700")}
                      onClick={() => handleToggle(account.id, account.enabled)}
                    >
                      {account.enabled
                        ? <><Pause className="w-3.5 h-3.5" /> PAUSE</>
                        : <><Play className="w-3.5 h-3.5" /> RESUME</>
                      }
                    </Button>

                    <Button
                      variant="ghost" size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(account.id, account.username)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Campaign Dialog */}
      <AddCampaignDialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setPendingResume(null); }}
        onSuccess={() => {
          setAddOpen(false);
          setPendingResume(null);
          localStorage.removeItem(PENDING_CAMPAIGN_KEY);
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        }}
        pendingResume={pendingResume}
      />
    </div>
  );
}

// ─── Add Campaign Dialog ──────────────────────────────────────────────────────

function AddCampaignDialog({
  open, onClose, onSuccess, pendingResume,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  pendingResume?: string | null;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [platform, setPlatform] = useState<string>("youtube");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [uploadTargets, setUploadTargets] = useState<string[]>([]);
  const [creds, setCreds] = useState<Record<string, { loginId: string; password: string }>>({});
  // Source platform credentials (for non-YouTube sources that require login to scrape)
  const [sourceCred, setSourceCred] = useState<{ loginId: string; password: string }>({ loginId: "", password: "" });
  const [resolving, setResolving] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const createAccount = useCreateAccount();
  const createCredential = useCreateCredential();
  const { toast } = useToast();

  // Total steps: YouTube source = 2 steps (no source cred needed), others = 3 steps
  const needsSourceCred = platform !== "youtube";
  const totalSteps = needsSourceCred ? 3 : 2;

  const reset = () => {
    setStep(1); setPlatform("youtube"); setUrl(""); setUsername("");
    setUploadTargets([]); setCreds({}); setSourceCred({ loginId: "", password: "" });
    setResolving(false); setResolvedName(null);
  };

  // When dialog reopens after YouTube OAuth, restore saved campaign data + auto-submit
  useEffect(() => {
    if (pendingResume && open) {
      try {
        const data = JSON.parse(pendingResume);
        setPlatform(data.platform ?? "youtube");
        setUrl(data.url ?? "");
        setUsername(data.username ?? "");
        setUploadTargets(data.uploadTargets ?? []);
        // Auto-submit after a brief delay (let state settle)
        const t = setTimeout(() => {
          if (data.url && data.username && data.uploadTargets?.length) {
            createAccount.mutate({
              data: { platform: data.platform ?? "youtube" as any, username: data.username, url: data.url, enabled: true, uploadTargets: data.uploadTargets } as any
            }, {
              onSuccess: () => {
                toast({ title: "Campaign started!", description: `@${data.username} is now being monitored.` });
                localStorage.removeItem(PENDING_CAMPAIGN_KEY);
                reset();
                onSuccess();
              },
              onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
            });
          }
        }, 300);
        return () => clearTimeout(t);
      } catch {}
    }
  }, [pendingResume, open]);

  const extractUsername = (rawUrl: string, plat: string): string => {
    try {
      const u = new URL(rawUrl.trim().startsWith("http") ? rawUrl.trim() : `https://${rawUrl.trim()}`);
      const p = u.pathname.replace(/\/$/, "");
      switch (plat) {
        case "youtube": {
          const m = p.match(/\/@([^/]+)/) || p.match(/\/c\/([^/]+)/) ||
            p.match(/\/user\/([^/]+)/) || p.match(/\/channel\/([^/]+)/);
          return m ? m[1] : "";
        }
        case "tiktok": { const m = p.match(/\/@([^/]+)/); return m ? m[1] : ""; }
        case "instagram": {
          const m = p.match(/^\/([^/]+)/); const n = m ? m[1] : "";
          return ["p","reel","stories","explore","accounts"].includes(n) ? "" : n;
        }
        case "facebook": {
          if (u.searchParams.get("id")) return `id_${u.searchParams.get("id")}`;
          const m = p.match(/^\/([^/]+)/); const n = m ? m[1] : "";
          return ["pages","groups","events","watch","profile.php"].includes(n) ? "" : n;
        }
        default: return "";
      }
    } catch { return ""; }
  };

  const normalizeUrl = (raw: string) => {
    const s = raw.trim();
    const w = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try {
      const u = new URL(w);
      ["sk","ref","fref","igsh","igshid","_t","_r"].forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch { return w; }
  };

  const handleUrlChange = async (val: string) => {
    setUrl(val);
    setResolvedName(null);
    if (!val.trim()) return;

    // Immediate fallback from URL pattern
    const immediate = extractUsername(val, platform);
    if (immediate) setUsername(immediate);

    // Then fetch real name from backend
    setResolving(true);
    try {
      const res = await fetch(`/api/accounts/resolve?url=${encodeURIComponent(val.trim())}`);
      if (res.ok) {
        const data = await res.json() as { username: string; handle: string | null; name: string | null };
        if (data.username) {
          setUsername(data.username);
          setResolvedName(data.name ?? data.handle ?? data.username);
        }
      }
    } catch { /* ignore */ }
    finally { setResolving(false); }
  };

  const toggleTarget = (p: string) =>
    setUploadTargets(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const setCredField = (plat: string, field: "loginId" | "password", val: string) =>
    setCreds(prev => {
      const current = prev[plat] || { loginId: "", password: "" };
      return {
        ...prev,
        [plat]: {
          ...current,
          [field]: val,
        },
      };
    });

  // Step 1: Channel URL + upload targets
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !username.trim()) return;

    if (needsSourceCred) {
      // Go to step 2: source platform login
      setStep(2);
    } else if (uploadTargets.length > 0) {
      // YouTube source — skip to upload platform login
      setStep(3);
    } else {
      // No upload targets — submit directly
      submitFinal();
    }
  };

  // Step 2: Source platform credentials
  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadTargets.length > 0) {
      setStep(3);
    } else {
      submitFinal();
    }
  };

  const submitFinal = async () => {
    createAccount.mutate({
      data: { platform: platform as any, username, url: normalizeUrl(url), enabled: true, uploadTargets } as any
    }, {
      onSuccess: async (newAccount: any) => {
        // Save SOURCE platform credentials if needed (for non-YouTube scraping)
        if (needsSourceCred && sourceCred.loginId && sourceCred.password) {
          try {
            await createCredential.mutateAsync({
              data: {
                platform: `${platform}_source` as any,
                label: sourceCred.loginId,
                accessToken: sourceCred.password
              }
            });
          } catch {}
        }

        // Save UPLOAD platform credentials for non-YouTube upload targets
        // Skip if user selected a pre-saved account (password === "___saved___")
        for (const t of uploadTargets) {
          if (t === "youtube") continue;
          const c = creds[t];
          if (!c?.loginId || !c?.password) continue;
          if (c.password === "___saved___") continue; // already saved, skip
          try {
            await createCredential.mutateAsync({
              data: { platform: t as any, label: c.loginId, accessToken: c.password }
            });
          } catch {}
        }

        toast({
          title: "Campaign started!",
          description: `@${username} is now being monitored. Scheduler will pick up the latest video automatically.`,
        });
        reset();
        onSuccess();
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  // Step label helper
  const stepLabel = (s: number) => {
    if (!needsSourceCred) {
      if (s === 1) return "Channel";
      if (s === 2) return "Upload Login";
    } else {
      if (s === 1) return "Channel";
      if (s === 2) return "Source Login";
      if (s === 3) return "Upload Login";
    }
    return "";
  };

  const actualStep = needsSourceCred ? step : step === 3 ? 2 : step;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-primary" />
            {step === 1 ? "New Clipping Campaign"
              : step === 2 && needsSourceCred ? `${PLATFORM_LABELS[platform as Platform]} Source Login`
              : "Upload Platform Login"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mt-2">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <div key={s} className="flex items-center gap-1.5 flex-1">
              <div className={cn(
                "h-1.5 flex-1 rounded-full transition-all",
                actualStep >= s ? "bg-primary" : "bg-white/10"
              )} />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <span key={s} className={cn(
              "flex-1 text-[10px] font-mono text-center",
              actualStep >= s ? "text-primary" : "text-muted-foreground"
            )}>
              {stepLabel(s)}
            </span>
          ))}
        </div>

        {/* ── STEP 1: Channel URL + upload targets ── */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-5 mt-4">
            {/* Source platform */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Source Platform (video kahan se leni hai)
              </label>
              <Select value={platform} onValueChange={p => {
                setPlatform(p); setUploadTargets([]);
                if (url) { const d = extractUsername(url, p); if (d) setUsername(d); }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p} value={p}>
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={p} className="w-4 h-4" />
                        {PLATFORM_LABELS[p]}
                        {p !== "youtube" && (
                          <span className="text-[10px] text-amber-400 font-mono">(login required)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {platform !== "youtube" && (
                <p className="text-xs text-amber-500/80 font-mono flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  {PLATFORM_LABELS[platform as Platform]} source ke liye login credentials maange jayenge (next step)
                </p>
              )}
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase">Channel / Profile URL</label>
              <Input
                value={url}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder={
                  platform === "youtube" ? "youtube.com/@MrBeast" :
                  platform === "tiktok" ? "tiktok.com/@charlidamelio" :
                  platform === "instagram" ? "instagram.com/cristiano" : "facebook.com/NASA"
                }
                required
              />
              {resolving ? (
                <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Detecting channel name...
                </p>
              ) : username ? (
                <p className="text-xs text-green-500 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {resolvedName && resolvedName !== username
                    ? `${resolvedName} (@${username})`
                    : `@${username}`
                  }
                </p>
              ) : (
                <p className="text-xs text-muted-foreground font-mono">URL paste karo — channel name auto detect hoga</p>
              )}
            </div>

            {/* Manual username override */}
            {url && !username && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase">Username (manual)</label>
                <Input value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. MrBeast" required />
              </div>
            )}

            {/* Upload platforms */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Upload Clips To (kahan upload honi chahiye)
                </label>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  Clips in platforms pe auto-schedule hongi — Part 1 (+6h), Part 2 (+12h), Part 3 (+18h), Part 4 (+24h)
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map(p => (
                  <label key={p} className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    uploadTargets.includes(p)
                      ? "border-primary bg-primary/10 text-white"
                      : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground"
                  )}>
                    <Checkbox checked={uploadTargets.includes(p)}
                      onCheckedChange={() => toggleTarget(p)} className="shrink-0" />
                    <PlatformIcon platform={p} className="w-5 h-5" />
                    <span className="text-sm font-medium">{PLATFORM_LABELS[p as Platform]}</span>
                  </label>
                ))}
              </div>
              {uploadTargets.length === 0 && (
                <p className="text-xs text-amber-500/80 font-mono">
                  No platform selected — sirf clip banegi, upload nahi
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={!username || !url} className="gap-2">
                {needsSourceCred
                  ? <><ArrowRight className="w-4 h-4" /> Next: Source Login</>
                  : uploadTargets.length > 0
                    ? <><ArrowRight className="w-4 h-4" /> Next: Upload Login</>
                    : "Start Campaign"
                }
              </Button>
            </div>
          </form>
        )}

        {/* ── STEP 2: Source platform credentials (non-YouTube sources) ── */}
        {step === 2 && needsSourceCred && (
          <form onSubmit={handleStep2} className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs font-mono text-amber-400 flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                {PLATFORM_LABELS[platform as Platform]} se video download karne ke liye login required hai.
                Credentials securely save honge aur browser automation use karega.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <PlatformIcon platform={platform} className="w-9 h-9" withBackground />
                <div>
                  <p className="text-white font-bold text-sm">{PLATFORM_LABELS[platform as Platform]} — Source Account</p>
                  <p className="text-xs text-muted-foreground font-mono">Video download ke liye (upload ke liye alag credentials honge)</p>
                </div>
              </div>

              <Input
                value={sourceCred.loginId}
                onChange={e => setSourceCred(prev => ({ ...prev, loginId: e.target.value }))}
                placeholder={SOURCE_CRED_REQUIRED[platform as Platform] ?? "Email / Username"}
                className="h-9 text-sm"
              />
              <Input
                value={sourceCred.password}
                onChange={e => setSourceCred(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Password"
                type="password"
                className="h-9 text-sm"
              />
            </div>

            <p className="text-xs text-muted-foreground font-mono">
              💡 Tip: ek dedicated account use karo (personal account se alag) — zyada safe
            </p>

            <div className="flex justify-between pt-1">
              <Button variant="outline" type="button" onClick={() => setStep(1)}>← Back</Button>
              <Button type="submit" className="gap-2">
                {uploadTargets.length > 0
                  ? <><ArrowRight className="w-4 h-4" /> Next: Upload Login</>
                  : <><Scissors className="w-4 h-4" /> Start Campaign</>
                }
              </Button>
            </div>
          </form>
        )}

        {/* ── STEP 3: Upload platform credentials ── */}
        {(step === 3 && uploadTargets.length > 0) && (
          <div className="space-y-4 mt-4">
            <UploadAccountSelector
              uploadTargets={uploadTargets}
              creds={creds}
              setCredField={setCredField}
              platform={platform}
              url={url}
              username={username}
              PENDING_CAMPAIGN_KEY={PENDING_CAMPAIGN_KEY}
            />
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(needsSourceCred ? 2 : 1)}>← Back</Button>
              <Button
                onClick={submitFinal}
                disabled={createAccount.isPending || createCredential.isPending}
                className="gap-2"
              >
                {createAccount.isPending ? "Starting..." : (
                  <><Scissors className="w-4 h-4" /> Start Campaign</>
                )}
              </Button>
            </div>
          </div>
        )}


        {/* Step 2 (YouTube source, no upload targets) — this case goes straight to submitFinal */}
      </DialogContent>
    </Dialog>
  );
}

// ─── UploadAccountSelector ──────────────────────────────────────────────────
// In Step 3, shows all connected accounts per upload platform.
// User can pick a saved account OR enter new credentials.

function UploadAccountSelector({
  uploadTargets, creds, setCredField, platform, url, username, PENDING_CAMPAIGN_KEY,
}: {
  uploadTargets: string[];
  creds: Record<string, { loginId: string; password: string }>;
  setCredField: (platform: string, field: string, value: string) => void;
  platform: string;
  url: string;
  username: string;
  PENDING_CAMPAIGN_KEY: string;
}) {
  const { data: allCredentials } = useListCredentials();
  const [, navigate] = useLocation();

  const credsByPlatform = (p: string) =>
    Array.isArray(allCredentials) ? allCredentials.filter(c => c.platform === p) : [];

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
        <p className="text-xs font-mono text-muted-foreground">
          Clips in upload hongi. Pehle se connected accounts select karo ya naya add karo.
        </p>
      </div>

      {uploadTargets.map(t => {
        const platformCreds = credsByPlatform(t);
        const hasCreds = platformCreds.length > 0;
        const selected = creds[t]?.loginId ?? "";

        return (
          <div key={t} className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <PlatformIcon platform={t} className="w-9 h-9" withBackground />
              <div>
                <p className="text-white font-bold text-sm">{PLATFORM_LABELS[t as Platform]}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {t === "youtube" ? "Google OAuth" : "Browser automation upload"}
                </p>
              </div>
            </div>

            {t === "youtube" ? (
              hasCreds ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-mono text-muted-foreground">Connected YouTube accounts:</p>
                  <div className="space-y-1.5">
                    {platformCreds.map(c => (
                      <label
                        key={c.id}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                          selected === c.label
                            ? "border-primary/50 bg-primary/10"
                            : "border-border bg-white/[0.02] hover:bg-white/[0.04]"
                        )}
                      >
                        <input
                          type="radio"
                          name={`yt-${t}`}
                          className="accent-primary"
                          checked={selected === c.label}
                          onChange={() => setCredField(t, "loginId", c.label)}
                        />
                        <div>
                          <p className="text-sm font-mono text-white">{c.label}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            Connected {formatDistanceToNow(new Date(c.connectedAt), { addSuffix: true })}
                          </p>
                        </div>
                        <CheckCircle2 className={cn("w-4 h-4 ml-auto", selected === c.label ? "text-primary" : "text-transparent")} />
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="w-full text-xs font-mono gap-1.5 text-muted-foreground hover:text-white"
                    onClick={() => {
                      localStorage.setItem(PENDING_CAMPAIGN_KEY, JSON.stringify({ platform, url, username, uploadTargets }));
                      window.location.href = "/api/auth/youtube";
                    }}
                  >
                    <Plus className="w-3 h-3" /> Add another YouTube account
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    type="button" variant="outline" className="w-full gap-2 text-xs"
                    onClick={() => {
                      localStorage.setItem(PENDING_CAMPAIGN_KEY, JSON.stringify({ platform, url, username, uploadTargets }));
                      window.location.href = "/api/auth/youtube";
                    }}
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Connect YouTube with Google
                  </Button>
                  <p className="text-[10px] text-muted-foreground font-mono text-center">
                    Pehle Google se login karo, phir campaign start hoga.
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-2">
                {hasCreds && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-mono text-muted-foreground">Saved accounts:</p>
                    {platformCreds.map(c => (
                      <label
                        key={c.id}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                          selected === c.label
                            ? "border-primary/50 bg-primary/10"
                            : "border-border bg-white/[0.02] hover:bg-white/[0.04]"
                        )}
                      >
                        <input
                          type="radio"
                          name={`acc-${t}`}
                          className="accent-primary"
                          checked={selected === c.label}
                          onChange={() => {
                            setCredField(t, "loginId", c.label);
                            setCredField(t, "password", "___saved___"); // sentinel — skip re-saving
                          }}
                        />
                        <div>
                          <p className="text-sm font-mono text-white">{c.label}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            Connected {formatDistanceToNow(new Date(c.connectedAt), { addSuffix: true })}
                          </p>
                        </div>
                        <CheckCircle2 className={cn("w-4 h-4 ml-auto", selected === c.label ? "text-primary" : "text-transparent")} />
                      </label>
                    ))}
                  </div>
                )}

                <div className={cn("space-y-1.5", hasCreds && "border-t border-border/50 pt-2")}>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {hasCreds ? "Ya naya account dalo:" : "Account credentials dalo:"}
                  </p>
                  <Input
                    value={selected === (creds[t]?.loginId ?? "") && creds[t]?.password === "___saved___" ? "" : (creds[t]?.loginId ?? "")}
                    onChange={e => {
                      setCredField(t, "loginId", e.target.value);
                      setCredField(t, "password", ""); // clear sentinel
                    }}
                    placeholder={
                      t === "tiktok" ? "TikTok email / @username" :
                      t === "instagram" ? "Instagram username / email" :
                      "Facebook email / phone"
                    }
                    className="h-9 text-sm"
                  />
                  {creds[t]?.password !== "___saved___" && (
                    <Input
                      value={creds[t]?.password ?? ""}
                      onChange={e => setCredField(t, "password", e.target.value)}
                      placeholder="Password"
                      type="password"
                      className="h-9 text-sm"
                    />
                  )}
                </div>

                <Button
                  type="button" variant="ghost" size="sm"
                  className="w-full text-xs font-mono gap-1.5 text-muted-foreground hover:text-white"
                  onClick={() => navigate("/credentials")}
                >
                  <Key className="w-3 h-3" /> Credentials page pe accounts manage karo
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
