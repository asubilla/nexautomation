import { useListCredentials, useCreateCredential, useDeleteCredential, getListCredentialsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2, Info, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { cn, getApiBase } from "@/lib/utils";

const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;
type Platform = typeof PLATFORMS[number];

const PLATFORM_INFO: Record<Platform, {
  label: string;
  color: string;
  method: "oauth" | "username_password";
  description: string;
  usernameLabel?: string;
  usernamePlaceholder?: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  helpText?: string;
}> = {
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    method: "oauth",
    description: "Google OAuth se safely connect hoga — koi password nahi dena.",
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    method: "username_password",
    description: "Browser automation se upload hoga.",
    usernameLabel: "Instagram Username / Email",
    usernamePlaceholder: "e.g. myaccount or email@gmail.com",
    passwordLabel: "Instagram Password",
    passwordPlaceholder: "Your Instagram password",
    helpText: "2FA enable hai toh pehle disable karo ya app password use karo.",
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    method: "username_password",
    description: "Browser automation se upload hoga.",
    usernameLabel: "Facebook Email / Phone",
    usernamePlaceholder: "e.g. email@gmail.com",
    passwordLabel: "Facebook Password",
    passwordPlaceholder: "Your Facebook password",
    helpText: "Business page wali account use karo for best results.",
  },
  tiktok: {
    label: "TikTok",
    color: "#010101",
    method: "oauth",
    description: "Official Login Kit OAuth (recommended) ya browser automation.",
    usernameLabel: "TikTok Username / Email",
    usernamePlaceholder: "e.g. @myusername or email@gmail.com",
    passwordLabel: "TikTok Password",
    passwordPlaceholder: "Your TikTok password",
    helpText: "Official API setup verified status support karta hai.",
  },
};

export default function Credentials() {
  const { data: credentials, isLoading } = useListCredentials();
  const deleteCredential = useDeleteCredential();
  const createCredential = useCreateCredential();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Handle Cloudflare Worker OAuth callback redirections
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    
    const tiktokConnected = params.get("tiktok_connected");
    const youtubeConnected = params.get("youtube_connected");
    const instagramConnected = params.get("instagram_connected");
    const facebookConnected = params.get("facebook_connected");

    if (error) {
      toast({ title: "OAuth Failed", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, "", "/credentials");
      return;
    }

    if (tiktokConnected) {
      const username = params.get("username") || "TikTok Account";
      const accessToken = params.get("accessToken");
      const refreshToken = params.get("refreshToken");
      if (accessToken) {
        toast({ title: "Connecting TikTok...", description: "Saving credentials to database..." });
        createCredential.mutate(
          { data: { platform: "tiktok", label: username, accessToken, refreshToken } },
          {
            onSuccess: () => {
              toast({ title: "✅ TikTok Connected!", description: `@${username} account successfully linked.` });
              queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
            },
            onError: (err: any) => {
              toast({ title: "TikTok Connection Failed", description: err.data?.error || err.message, variant: "destructive" });
            }
          }
        );
      }
      window.history.replaceState({}, "", "/credentials");
    } else if (youtubeConnected) {
      const username = params.get("username") || "YouTube Channel";
      const accessToken = params.get("accessToken");
      const refreshToken = params.get("refreshToken");
      if (accessToken) {
        toast({ title: "Connecting YouTube...", description: "Saving credentials to database..." });
        createCredential.mutate(
          { data: { platform: "youtube", label: username, accessToken, refreshToken } },
          {
            onSuccess: () => {
              toast({ title: "✅ YouTube Connected!", description: `"${username}" successfully linked.` });
              queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
            },
            onError: (err: any) => {
              toast({ title: "YouTube Connection Failed", description: err.data?.error || err.message, variant: "destructive" });
            }
          }
        );
      }
      window.history.replaceState({}, "", "/credentials");
    } else if (instagramConnected) {
      const username = params.get("username") || "Instagram Account";
      const accessToken = params.get("accessToken");
      const clientId = params.get("clientId");
      if (accessToken) {
        toast({ title: "Connecting Instagram...", description: "Saving credentials to database..." });
        createCredential.mutate(
          { data: { platform: "instagram", label: username, accessToken, clientId } },
          {
            onSuccess: () => {
              toast({ title: "✅ Instagram Connected!", description: `@${username} successfully linked.` });
              queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
            },
            onError: (err: any) => {
              toast({ title: "Instagram Connection Failed", description: err.data?.error || err.message, variant: "destructive" });
            }
          }
        );
      }
      window.history.replaceState({}, "", "/credentials");
    } else if (facebookConnected) {
      const pagesStr = params.get("pages");
      if (pagesStr) {
        try {
          const pages = JSON.parse(pagesStr);
          if (Array.isArray(pages) && pages.length > 0) {
            toast({ title: "Connecting Facebook Pages...", description: `Saving ${pages.length} page(s) to database...` });
            
            // Create credentials for all pages
            let successCount = 0;
            let failCount = 0;
            pages.forEach((page) => {
              createCredential.mutate(
                { data: { platform: "facebook", label: page.name, accessToken: page.accessToken, clientId: page.id } },
                {
                  onSuccess: () => {
                    successCount++;
                    if (successCount + failCount === pages.length) {
                      toast({ title: "✅ Facebook Connected!", description: `Successfully linked ${successCount} pages.` });
                      queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
                    }
                  },
                  onError: (err: any) => {
                    failCount++;
                    toast({ title: `Failed to link page "${page.name}"`, description: err.data?.error || err.message, variant: "destructive" });
                    if (successCount + failCount === pages.length) {
                      queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
                    }
                  }
                }
              );
            });
          }
        } catch (e) {
          toast({ title: "Facebook Connection Failed", description: "Invalid pages data received", variant: "destructive" });
        }
      }
      window.history.replaceState({}, "", "/credentials");
    }
  }, [queryClient, toast]);

  const handleDelete = (id: number, label: string, platform: string) => {
    if (!confirm(`Disconnect "${label}" from ${platform}? Uploads will fail until reconnected.`)) return;
    setDeletingId(id);
    deleteCredential.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
        toast({ title: "Disconnected", description: `${label} account removed.` });
        setDeletingId(null);
      },
      onError: () => setDeletingId(null),
    });
  };

  const handleConnectClick = (platform: Platform) => {
    if (platform === "youtube") {
      window.location.href = "https://nex-auth.asubilla115.workers.dev/auth/youtube";
    } else {
      setConnectingPlatform(platform);
    }
  };

  // Group credentials by platform
  const credsByPlatform = (platform: Platform) =>
    Array.isArray(credentials) ? credentials.filter(c => c.platform === platform) : [];

  const totalConnected = Array.isArray(credentials) ? credentials.length : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Platform Credentials</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Multiple accounts connect karo — AI Clipping campaigns inhe use karengi.
          </p>
        </div>
        {totalConnected > 0 && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
            <Users className="w-4 h-4 text-green-400" />
            <span className="text-green-400 font-mono text-sm font-semibold">{totalConnected} Account{totalConnected !== 1 ? "s" : ""} Connected</span>
          </div>
        )}
      </div>

      {/* Platform Sections */}
      <div className="space-y-6">
        {PLATFORMS.map((platform) => {
          const info = PLATFORM_INFO[platform];
          const creds = credsByPlatform(platform);
          const count = creds.length;

          return (
            <div key={platform} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Platform Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={platform} className="w-9 h-9" withBackground />
                  <div>
                    <h3 className="font-bold text-white text-base">{info.label}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        "text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider",
                        platform === "youtube"
                          ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                          : platform === "tiktok"
                          ? "text-green-400 border-green-500/20 bg-green-500/10"
                          : "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                      )}>
                        {platform === "youtube" ? "🔐 Google OAuth" : platform === "tiktok" ? "🔐 API / OAuth" : "🤖 Browser Automation"}
                      </span>
                      {count > 0 && (
                        <span className="text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded uppercase">
                          {count} account{count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gap-2 font-mono text-xs h-8"
                  onClick={() => handleConnectClick(platform)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Account
                </Button>
              </div>

              {/* Accounts List */}
              {count === 0 ? (
                <div className="px-6 py-8 flex flex-col items-center gap-2 text-center">
                  <XCircle className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm font-mono text-muted-foreground">No accounts connected</p>
                  <p className="text-xs font-mono text-muted-foreground/60">{info.description}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {creds.map((cred, idx) => (
                    <div
                      key={cred.id}
                      className="flex items-center justify-between px-6 py-3.5 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Account number badge */}
                        <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-mono font-bold text-primary">{idx + 1}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-mono text-white font-medium">{cred.label}</p>
                            <span className="flex items-center gap-1 text-[10px] font-mono text-green-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Connected
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                            Added {formatDistanceToNow(new Date(cred.connectedAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => handleDelete(cred.id, cred.label, info.label)}
                        disabled={deletingId === cred.id}
                      >
                        {deletingId === cred.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info box */}
      <div className="bg-card border border-border rounded-lg p-4 flex gap-3">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs font-mono text-muted-foreground space-y-1">
          <p className="text-white font-semibold">Multiple Accounts</p>
          <p>• Ek hi platform ke multiple accounts add kar sakte ho (e.g., 3 Instagram accounts)</p>
          <p>• Campaign setup mein choose kar sako ge ke konsa account use ho</p>
          <p>• Sab credentials securely database mein encrypted store hote hain</p>
          <p>• <span className="text-white">YouTube</span> — Google OAuth (safest, token auto-refresh hota hai)</p>
          <p>• <span className="text-white">Instagram / Facebook / TikTok</span> — Username + Password (browser automation)</p>
        </div>
      </div>

      {/* Connect Dialog */}
      {connectingPlatform && connectingPlatform !== "youtube" && (
        <ConnectDialog
          platform={connectingPlatform}
          open={!!connectingPlatform}
          onClose={() => setConnectingPlatform(null)}
          onSuccess={() => {
            setConnectingPlatform(null);
            queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
          }}
        />
      )}
    </div>
  );
}

function ConnectDialog({
  platform,
  open,
  onClose,
  onSuccess,
}: {
  platform: Platform;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const info = PLATFORM_INFO[platform];
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const createCredential = useCreateCredential();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    createCredential.mutate(
      {
        data: {
          platform: platform as any,
          label: username.trim(),
          accessToken: password.trim(),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: `✅ ${info.label} Connected!`,
            description: `@${username} account saved successfully.`,
          });
          setUsername("");
          setPassword("");
          onSuccess();
        },
        onError: (err: any) => {
          toast({
            title: `${info.label} Connection Failed`,
            description: err.data?.error ?? err.message ?? "Invalid credentials",
            variant: "destructive",
          });
        },
      }
    );
  };

  const supportsOAuth = platform === "tiktok" || platform === "facebook" || platform === "instagram";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <PlatformIcon platform={platform} className="w-7 h-7" withBackground />
            Add {info.label} Account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {supportsOAuth && (
            <>
              <Button
                type="button"
                className="w-full gap-2 text-xs bg-[#010101] text-white hover:bg-black/90 border border-zinc-800"
                onClick={() => window.open(`https://nex-auth.asubilla115.workers.dev/auth/${platform}`, "_self")}
              >
                {platform === "tiktok" && (
                  <svg className="w-4 h-4 flex-shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.02-2.89-.35-4.2-1-.28-.15-.56-.32-.83-.51.02 2.6.01 5.2.02 7.8-.04 2.29-.67 4.67-2.33 6.27-1.66 1.65-4.11 2.45-6.43 2.44-2.32-.01-4.78-.79-6.43-2.45C.61 20.48-.03 18.09 0 15.79c-.04-2.29.6-4.76 2.25-6.42 1.66-1.66 4.1-2.47 6.42-2.45v4.09c-1.39-.02-2.88.42-3.84 1.45s-1.34 2.58-1.22 3.97c.11 1.39.9 2.77 2.07 3.51 1.17.75 2.71.87 4 .31 1.29-.56 2.07-1.87 2.1-3.27.02-3.66.01-7.32.02-10.98.01-1.31.02-2.61.02-3.92-.01-.01-.01-.01 0-.01z"/>
                  </svg>
                )}
                {platform === "facebook" && (
                  <svg className="w-4 h-4 flex-shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                )}
                {platform === "instagram" && (
                  <svg className="w-4 h-4 flex-shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                )}
                Connect {info.label} with OAuth (Recommended)
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground font-mono">Or Use Credentials</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <span className="text-yellow-400 text-xs font-mono">🤖 Browser Automation</span>
              <span className="text-muted-foreground text-xs font-mono">
                {supportsOAuth ? "— Backup username + password" : "— Playwright se login karke upload karega"}
              </span>
            </div>

            <p className="text-xs text-muted-foreground font-mono">{info.description}</p>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase">
                {info.usernameLabel}
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={info.usernamePlaceholder}
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase">
                {info.passwordLabel}
              </label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={info.passwordPlaceholder}
                type="password"
                autoComplete="new-password"
                required
              />
            </div>

            {info.helpText && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-muted-foreground">{info.helpText}</p>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-mono text-muted-foreground">
                Credentials verify honge. Agar captcha aaya to account automatically save hoga aur pehle upload pe test hoga.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCredential.isPending} className="gap-2">
                {createCredential.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying &amp; Connecting...</>
                ) : (
                  `Add ${info.label} Account`
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}


