import { useState } from "react";
import { useLocation } from "wouter";
import { useListAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, ExternalLink, Upload, BarChart2 } from "lucide-react";
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

const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;
type Platform = typeof PLATFORMS[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");

  const handleToggle = (id: number, currentEnabled: boolean) => {
    updateAccount.mutate({ id, data: { enabled: !currentEnabled } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        toast({ title: "Account updated", description: currentEnabled ? "Monitoring paused." : "Monitoring active." });
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

  const filteredAccounts = accounts?.filter(a =>
    a.username.toLowerCase().includes(search.toLowerCase()) ||
    a.platform.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Monitored Accounts</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Add any public channel/profile — videos auto-download and re-upload to your chosen platforms.
          </p>
        </div>
        <AddAccountDialog />
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            className="pl-9 font-mono bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground font-mono">Loading...</div>
        ) : filteredAccounts?.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-muted-foreground font-mono">No accounts yet.</p>
            <p className="text-muted-foreground/60 text-sm font-mono">
              Click "ADD ACCOUNT" and paste any YouTube channel URL, TikTok profile, Instagram page, or Facebook page.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredAccounts?.map((account) => {
              const uploadTargets: string[] = Array.isArray((account as any).uploadTargets)
                ? (account as any).uploadTargets
                : [];

              return (
                <div key={account.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <PlatformIcon platform={account.platform} className="w-10 h-10 shrink-0" withBackground />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white truncate">{account.username}</h3>
                        <a href={account.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors shrink-0">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Source: <span className="text-white capitalize">{account.platform}</span></span>
                        <span>•</span>
                        <span>Downloaded: <span className="text-white">{account.totalDownloaded || 0}</span></span>
                        {account.lastCheckedAt && (
                          <>
                            <span>•</span>
                            <span>Checked: <span className="text-white">{formatDistanceToNow(new Date(account.lastCheckedAt), { addSuffix: true })}</span></span>
                          </>
                        )}
                      </p>
                      {uploadTargets.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          <Upload className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono mr-1">Upload to:</span>
                          {uploadTargets.map(t => (
                            <Badge key={t} variant="secondary" className="text-xs capitalize px-1.5 py-0 h-4">
                              {PLATFORM_LABELS[t as Platform] ?? t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 font-mono text-xs text-primary hover:text-primary hover:bg-primary/10 border border-primary/20"
                      onClick={() => navigate(`/analytics/${account.id}`)}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      ANALYTICS
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{account.enabled ? 'ACTIVE' : 'PAUSED'}</span>
                      <Switch
                        checked={account.enabled}
                        onCheckedChange={() => handleToggle(account.id, account.enabled)}
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(account.id)}>
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

function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<string>("youtube");
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [uploadTargets, setUploadTargets] = useState<string[]>([]);

  const createAccount = useCreateAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleTarget = (p: string) => {
    setUploadTargets(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!platform || !username || !url) return;
    const normalizedUrl = normalizeUrl(url);

    createAccount.mutate({
      data: {
        platform: platform as any,
        username,
        url: normalizedUrl,
        enabled: true,
        uploadTargets,
      } as any
    }, {
      onSuccess: () => {
        toast({ title: "Account added!", description: `Now monitoring @${username} on ${platform}.` });
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        setOpen(false);
        setUsername("");
        setUrl("");
        setUploadTargets([]);
      },
      onError: (err: any) => {
        toast({ title: "Error adding account", description: err.message, variant: "destructive" });
      }
    });
  };

  const availableTargets = PLATFORMS.filter(p => p !== platform);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-mono">
          <Plus className="w-4 h-4" />
          ADD ACCOUNT
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Add Monitored Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Source Platform</label>
            <Select value={platform} onValueChange={p => { setPlatform(p); setUploadTargets([]); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map(p => (
                  <SelectItem key={p} value={p}>
                    <div className="flex items-center gap-2 capitalize">{PLATFORM_LABELS[p]}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Username / Channel Name</label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. MrBeast"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Profile / Channel URL</label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={
                platform === "youtube" ? "youtube.com/@MrBeast  ya  www.youtube.com/@MrBeast" :
                platform === "tiktok" ? "tiktok.com/@charlidamelio" :
                platform === "instagram" ? "instagram.com/cristiano" :
                "facebook.com/NASA"
              }
              type="text"
              required
            />
            <p className="text-xs text-muted-foreground font-mono">
              Sirf URL paste karo — https:// apne aap lag jayega.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-mono text-muted-foreground uppercase">Upload To (select platforms)</label>
            <p className="text-xs text-muted-foreground -mt-1">Downloaded videos will be re-uploaded to all checked platforms.</p>
            <div className="grid grid-cols-2 gap-2">
              {availableTargets.map(p => (
                <label
                  key={p}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    uploadTargets.includes(p)
                      ? "border-primary bg-primary/10 text-white"
                      : "border-border bg-card/50 text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  <Checkbox
                    checked={uploadTargets.includes(p)}
                    onCheckedChange={() => toggleTarget(p)}
                    className="shrink-0"
                  />
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={p} className="w-5 h-5" />
                    <span className="text-sm font-medium">{PLATFORM_LABELS[p as Platform]}</span>
                  </div>
                </label>
              ))}
            </div>
            {uploadTargets.length === 0 && (
              <p className="text-xs text-amber-500/80 font-mono">No upload targets selected — videos will only be downloaded.</p>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createAccount.isPending}>
              {createAccount.isPending ? "Adding..." : "Add Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
