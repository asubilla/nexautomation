import { useListCredentials, useCreateCredential, useDeleteCredential, getListCredentialsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Key, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { cn } from "@/lib/utils";

const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;

export default function Credentials() {
  const { data: credentials, isLoading } = useListCredentials();
  const deleteCredential = useDeleteCredential();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: number) => {
    if (confirm("Disconnect this platform? Uploads will fail until reconnected.")) {
      deleteCredential.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
          toast({ title: "Credential removed" });
        }
      });
    }
  };

  const platforms = PLATFORMS;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Platform Credentials</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">Connect accounts where AI generated content will be uploaded.</p>
        </div>
        <AddCredentialDialog />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {platforms.map(platform => {
          const cred = credentials?.find(c => c.platform === platform);
          const isConnected = !!cred;

          return (
            <div key={platform} className={cn("bg-card border rounded-lg p-6 relative overflow-hidden transition-colors", isConnected ? "border-primary/50 bg-primary/5" : "border-border")}>
              <div className="flex justify-between items-start mb-6">
                <PlatformIcon platform={platform} className="w-12 h-12" withBackground />
                {isConnected ? (
                  <span className="flex items-center gap-1.5 text-xs font-mono font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded">
                    <CheckCircle2 className="w-3 h-3" />
                    CONNECTED
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-mono font-medium text-muted-foreground bg-white/5 px-2 py-1 rounded">
                    <XCircle className="w-3 h-3" />
                    DISCONNECTED
                  </span>
                )}
              </div>
              
              <div>
                <h3 className="font-bold text-lg text-white capitalize">{platform}</h3>
                {isConnected ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-mono text-foreground">{cred.label}</p>
                    <p className="text-xs font-mono text-muted-foreground">Connected {formatDistanceToNow(new Date(cred.connectedAt), { addSuffix: true })}</p>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-4 border-destructive/50 text-destructive hover:bg-destructive/10 font-mono"
                      onClick={() => handleDelete(cred.id)}
                    >
                      DISCONNECT
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-xs font-mono text-muted-foreground mb-4">Required for automated uploading.</p>
                    <AddCredentialDialog defaultPlatform={platform as any} buttonProps={{ className: "w-full font-mono", size: "sm" }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddCredentialDialog({ defaultPlatform, buttonProps = {} }: { defaultPlatform?: string, buttonProps?: any }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<string>(defaultPlatform || "youtube");
  const [label, setLabel] = useState("");
  const [accessToken, setAccessToken] = useState("");
  
  const createCredential = useCreateCredential();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!platform || !label || !accessToken) return;

    createCredential.mutate({ 
      data: { 
        platform: platform as any, 
        label, 
        accessToken 
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Credential added successfully" });
        queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
        setOpen(false);
        setLabel("");
        setAccessToken("");
      },
      onError: (err: any) => {
        toast({ title: "Error adding credential", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...buttonProps} className={cn("gap-2 font-mono", buttonProps.className)}>
          <Key className="w-4 h-4" />
          CONNECT
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connect Platform</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {!defaultPlatform && (
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase">Platform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PlatformCredentialInputPlatform).map(p => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Account Label</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Main Channel" required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">API Token</label>
            <Input value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Paste your API access token" type="password" required />
            <p className="text-[10px] text-muted-foreground font-mono mt-1">In a real app, this would use OAuth.</p>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createCredential.isPending}>
              {createCredential.isPending ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
