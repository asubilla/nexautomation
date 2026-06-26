import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListAccounts, useCreateAccount, useUpdateAccount,
  useDeleteAccount, useCreateCredential, getListAccountsQueryKey,
  useTriggerCheck,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, ExternalLink, Upload, BarChart2,
         Info, Zap, CheckCircle2, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, getApiBase } from "@/lib/utils";

const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;
type Platform = typeof PLATFORMS[number];
const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
};

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const triggerCheck = useTriggerCheck();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const handleToggle = (id: number, currentEnabled: boolean) => {
    updateAccount.mutate({ id, data: { enabled: !currentEnabled } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        toast({ title: currentEnabled ? "Monitoring paused" : "Monitoring resumed — will check on next cycle" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Remove this account? All associated jobs will be deleted.")) {
      deleteAccount.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          toast({ title: "Account removed" });
        }
      });
    }
  };

  const handleTriggerNow = (accountId: number, username: string) => {
    triggerCheck.mutate({ data: { accountId } as any }, {
      onSuccess: () => {
        toast({ title: `Check triggered for @${username}`, description: "Scheduler will process shortly..." });
        setTimeout(() => queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }), 3000);
      },
      onError: () => toast({ title: "Trigger failed", variant: "destructive" }),
    });
  };

  const filtered = Array.isArray(accounts)
    ? accounts.filter(a =>
        a.username.toLowerCase().includes(search.toLowerCase()) ||
        a.platform.toLowerCase().includes(search.toLowerCase()))
    : [];

  const activeCount = filtered.filter(a => a.enabled).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Monitored Accounts</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Channel ka URL dalo — har naya video automatically download, clip aur schedule hoga. Hamesha active rahega.
          </p>
        </div>
        <AddAccountDialog />
      </div>

      {/* Status bar */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-mono text-white">{activeCount} active</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>Scheduler checks every 15 min automatically</span>
          </div>
          <div className="ml-auto">
            <Button
              variant="outline" size="sm"
              className="gap-2 font-mono text-xs"
              disabled={triggerCheck.isPending}
              onClick={() => triggerCheck.mutate({ data: {} }, {
                onSuccess: () => toast({ title: "Full check triggered", description: "All accounts being checked now..." }),
              })}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", triggerCheck.isPending && "animate-spin")} />
              CHECK NOW
            </Button>
          </div>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search accounts..." className="pl-9 font-mono bg-card"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground font-mono">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="text-4xl">📡</div>
            <p className="text-white font-bold">No accounts yet</p>
            <p className="text-muted-foreground/70 text-sm font-mono max-w-sm mx-auto">
              "ADD ACCOUNT" pe click karo. Channel URL dalo, upload platform select karo, login karo — bas ek baar.
              Phir sab automatic hoga hamesha.
            </p>
            <AddAccountDialog />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(account => {
              const uploadTargets: string[] = Array.isArray((account as any).uploadTargets)
                ? (account as any).uploadTargets : [];
              return (
                <div key={account.id} className={cn(
                  "p-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors",
                  !account.enabled && "opacity-60"
                )}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <PlatformIcon platform={account.platform} className="w-10 h-10" withBackground />
                      {account.enabled && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white truncate">{account.username}</h3>
                        <a href={account.url} target="_blank" rel="noreferrer"
                          className="text-muted-foreground hover:text-primary shrink-0">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {!account.enabled && (
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                            PAUSED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="capitalize">{account.platform}</span>
                        <span>•</span>
                        <span>Downloaded: <span className="text-white">{account.totalDownloaded || 0}</span></span>
                        {account.lastCheckedAt ? (
                          <>
                            <span>•</span>
                            <span>Checked: <span className="text-white">{formatDistanceToNow(new Date(account.lastCheckedAt), { addSuffix: true })}</span></span>
                          </>
                        ) : (
                          <>
                            <span>•</span>
                            <span className="text-amber-400">Not checked yet</span>
                          </>
                        )}
                      </p>
                      {uploadTargets.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          <Upload className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono mr-1">Auto-upload to:</span>
                          {uploadTargets.map(t => (
                            <Badge key={t} variant="secondary" className="text-xs capitalize px-1.5 py-0 h-4">
                              {PLATFORM_LABELS[t as Platform] ?? t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost" size="sm"
                      className="gap-1.5 font-mono text-xs hover:bg-primary/10 border border-primary/20 text-primary"
                      title="Trigger immediate check"
                      disabled={triggerCheck.isPending}
                      onClick={() => handleTriggerNow(account.id, account.username)}
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="gap-1.5 font-mono text-xs text-primary hover:bg-primary/10 border border-primary/20"
                      onClick={() => navigate(`/analytics/${account.id}`)}>
                      <BarChart2 className="w-3.5 h-3.5" /> STATS
                    </Button>
                    <Switch checked={account.enabled}
                      onCheckedChange={() => handleToggle(account.id, account.enabled)}
                      title={account.enabled ? "Pause monitoring" : "Resume monitoring"}
                    />
                    <Button variant="ghost" size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(account.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [platform, setPlatform] = useState<string>("youtube");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [uploadTargets, setUploadTargets] = useState<string[]>([]);

  // Step 2: login creds per upload target
  const [creds, setCreds] = useState<Record<string, { loginId: string; password: string }>>({});

  const createAccount = useCreateAccount();
  const createCredential = useCreateCredential();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reset = () => {
    setStep(1); setPlatform("youtube"); setUrl(""); setUsername("");
    setUploadTargets([]); setCreds({});
  };

  const extractUsername = (rawUrl: string, plat: string): string => {
    try {
      const u = new URL(rawUrl.trim().startsWith("http") ? rawUrl.trim() : `https://${rawUrl.trim()}`);
      const pathname = u.pathname.replace(/\/$/, "");
      switch (plat) {
        case "youtube": {
          const m = pathname.match(/\/@([^/]+)/) || pathname.match(/\/c\/([^/]+)/) ||
                    pathname.match(/\/user\/([^/]+)/) || pathname.match(/\/channel\/([^/]+)/);
          return m ? m[1] : "";
        }
        case "tiktok": { const m = pathname.match(/\/@([^/]+)/); return m ? m[1] : ""; }
        case "instagram": {
          const m = pathname.match(/^\/([^/]+)/); const n = m ? m[1] : "";
          return ["p","reel","stories","explore","accounts"].includes(n) ? "" : n;
        }
        case "facebook": {
          if (u.searchParams.get("id")) return `id_${u.searchParams.get("id")}`;
          const m = pathname.match(/^\/([^/]+)/); const n = m ? m[1] : "";
          return ["pages","groups","events","watch","profile.php"].includes(n) ? "" : n;
        }
        default: return "";
      }
    } catch { return ""; }
  };

  const normalizeUrl = (raw: string) => {
    const s = raw.trim();
    if (!s) return s;
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try {
      const u = new URL(withProto);
      ["sk","ref","fref","locale","locale2","refsrc","_rdr","igsh","igshid","_t","_r"]
        .forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch { return withProto; }
  };

  const handleUrlChange = (val: string) => {
    setUrl(val);
    if (val.trim()) { const d = extractUsername(val, platform); if (d) setUsername(d); }
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

  // Step 1 → Step 2 (or direct submit if no targets)
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!platform || !username || !url) return;
    if (uploadTargets.length === 0) { handleFinalSubmit([]); return; }
    setStep(2);
  };

  const handleFinalSubmit = async (_credList: any[]) => {
    const normalizedUrl = normalizeUrl(url);
    createAccount.mutate({
      data: { platform: platform as any, username, url: normalizedUrl, enabled: true, uploadTargets } as any
    }, {
      onSuccess: async () => {
        // Save credentials for each upload target that has loginId+password filled
        const saves = uploadTargets
          .filter(t => !needsGoogleOAuth(t))
          .map(async t => {
            const c = creds[t];
            if (!c?.loginId || !c?.password) return;
            try {
              await createCredential.mutateAsync({
                data: { platform: t as any, label: c.loginId, accessToken: c.password }
              });
            } catch (err: any) {
              console.warn(`Cred save for ${t}:`, err.message);
            }
          });
        await Promise.all(saves);

        const savedPlatforms = uploadTargets
          .filter(t => !needsGoogleOAuth(t) && creds[t]?.loginId && creds[t]?.password)
          .map(t => PLATFORM_LABELS[t as Platform]);

        const ytTargets = uploadTargets.filter(t => needsGoogleOAuth(t));

        let desc = `Monitoring @${username}. `;
        if (savedPlatforms.length > 0) desc += `✅ ${savedPlatforms.join(", ")} saved. `;
        if (ytTargets.length > 0) desc += `⚠️ YouTube: Credentials page se connect karo.`;

        toast({ title: "Account added!", description: desc });
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        setOpen(false);
        reset();
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  // Need Google OAuth for YouTube upload
  const needsGoogleOAuth = (t: string) => t === "youtube";
  const needsTikTokOAuth = (t: string) => t === "tiktok";

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-mono"><Plus className="w-4 h-4" /> ADD ACCOUNT</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Add Monitored Account" : "Connect Upload Accounts"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <form onSubmit={handleStep1} className="space-y-5 mt-4">
            {/* Source platform */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase">Source Platform</label>
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
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* URL */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase">Channel / Profile URL</label>
              <Input value={url} onChange={e => handleUrlChange(e.target.value)}
                placeholder={
                  platform === "youtube" ? "youtube.com/@MrBeast" :
                  platform === "tiktok" ? "tiktok.com/@charlidamelio" :
                  platform === "instagram" ? "instagram.com/cristiano" : "facebook.com/NASA"
                } required />
              <p className="text-xs text-muted-foreground font-mono">https:// apne aap lag jaayega</p>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase">Username</label>
              <Input value={username} onChange={e => setUsername(e.target.value)}
                placeholder="e.g. MrBeast" required />
              {username && <p className="text-xs text-green-500 font-mono">✓ @{username}</p>}
            </div>

            {/* Upload targets */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase">Upload To</label>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  Clips in platforms pe schedule hongi (4 clips × har 6 ghante = 1 clip)
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.filter(p => p !== platform).map(p => (
                  <label key={p} className={cn(
                    "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    uploadTargets.includes(p)
                      ? "border-primary bg-primary/10 text-white"
                      : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground"
                  )}>
                    <Checkbox checked={uploadTargets.includes(p)}
                      onCheckedChange={() => toggleTarget(p)} className="shrink-0" />
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={p} className="w-5 h-5" />
                      <span className="text-sm font-medium">{PLATFORM_LABELS[p as Platform]}</span>
                    </div>
                  </label>
                ))}
              </div>
              {uploadTargets.length === 0 && (
                <p className="text-xs text-amber-500/80 font-mono">
                  Koi target nahi — sirf download hoga, upload nahi
                </p>
              )}
            </div>

            {/* Schedule info box */}
            {uploadTargets.length > 0 && (
              <div className="flex gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-muted-foreground">
                  <span className="text-white">4 clips</span> generate hongi → 
                  Clip 1 <span className="text-white">+6h</span>, 
                  Clip 2 <span className="text-white">+12h</span>, 
                  Clip 3 <span className="text-white">+18h</span>, 
                  Clip 4 <span className="text-white">+24h</span> — phir sab delete
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">
                {uploadTargets.length > 0 ? "Next: Connect Accounts →" : "Add Account"}
              </Button>
            </div>
          </form>
        ) : (
          /* Step 2: Login for each upload target */
          <div className="space-y-5 mt-4">
            <p className="text-xs text-muted-foreground font-mono">
              Har upload platform pe login karo. Clips yahan actual account pe upload hongi.
            </p>

            {uploadTargets.map(t => (
              <div key={t} className="rounded-lg border border-border bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={t} className="w-8 h-8" withBackground />
                  <div>
                    <p className="text-white font-semibold text-sm">{PLATFORM_LABELS[t as Platform] ?? t}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {needsGoogleOAuth(t) ? "Google OAuth se connect" : needsTikTokOAuth(t) ? "Official OAuth ya Credentials" : "Username + Password"}
                    </p>
                  </div>
                </div>

                {needsGoogleOAuth(t) ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      className="w-full gap-2 text-xs"
                      variant="outline"
                      onClick={() => window.open("/api/auth/youtube", "_blank")}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Connect YouTube with Google
                    </Button>
                    <p className="text-[10px] text-muted-foreground font-mono text-center">
                      Naya tab khulega — connect karke wapas aao
                    </p>
                  </div>
                ) : needsTikTokOAuth(t) ? (
                  <div className="space-y-3">
                    <Button
                      type="button"
                      className="w-full gap-2 text-xs bg-[#010101] text-white hover:bg-black/90 border border-zinc-800"
                      onClick={() => window.open(`${getApiBase()}/api/auth/tiktok`, "_self")}
                    >
                      <svg className="w-4 h-4 flex-shrink-0 fill-current" viewBox="0 0 24 24">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.02-2.89-.35-4.2-1-.28-.15-.56-.32-.83-.51.02 2.6.01 5.2.02 7.8-.04 2.29-.67 4.67-2.33 6.27-1.66 1.65-4.11 2.45-6.43 2.44-2.32-.01-4.78-.79-6.43-2.45C.61 20.48-.03 18.09 0 15.79c-.04-2.29.6-4.76 2.25-6.42 1.66-1.66 4.1-2.47 6.42-2.45v4.09c-1.39-.02-2.88.42-3.84 1.45s-1.34 2.58-1.22 3.97c.11 1.39.9 2.77 2.07 3.51 1.17.75 2.71.87 4 .31 1.29-.56 2.07-1.87 2.1-3.27.02-3.66.01-7.32.02-10.98.01-1.31.02-2.61.02-3.92-.01-.01-.01-.01 0-.01z"/>
                      </svg>
                      Connect TikTok with OAuth
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-card px-2 text-muted-foreground font-mono">Or Legacy Browser Login</span></div>
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={creds[t]?.loginId ?? ""}
                        onChange={e => setCredField(t, "loginId", e.target.value)}
                        placeholder="TikTok email ya @username"
                        className="text-xs h-9"
                      />
                      <Input
                        value={creds[t]?.password ?? ""}
                        onChange={e => setCredField(t, "password", e.target.value)}
                        placeholder="Password"
                        type="password"
                        className="text-xs h-9"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={creds[t]?.loginId ?? ""}
                      onChange={e => setCredField(t, "loginId", e.target.value)}
                      placeholder={
                        t === "instagram" ? "Instagram username ya email" :
                        "Facebook email ya phone"
                      }
                      className="text-xs h-9"
                    />
                    <Input
                      value={creds[t]?.password ?? ""}
                      onChange={e => setCredField(t, "password", e.target.value)}
                      placeholder="Password"
                      type="password"
                      className="text-xs h-9"
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
              <Button
                onClick={() => handleFinalSubmit([])}
                disabled={createAccount.isPending || createCredential.isPending}
              >
                {createAccount.isPending || createCredential.isPending ? "Saving..." : "✅ Add Account & Save"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono text-center">
              Credentials Credentials page pe bhi baad mein add/edit ho sakti hain
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
