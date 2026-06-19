import { useState } from "react";
import { useListAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Edit2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");

  const handleToggle = (id: number, currentEnabled: boolean) => {
    updateAccount.mutate({ id, data: { enabled: !currentEnabled } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        toast({ title: "Account updated", description: "Monitoring status changed." });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to remove this account?")) {
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
          <p className="text-muted-foreground mt-1 font-mono text-sm">Target accounts to download content from.</p>
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
          <div className="p-12 text-center text-muted-foreground font-mono">
            No accounts found. Add one to start monitoring.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredAccounts?.map((account) => (
              <div key={account.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-4">
                  <PlatformIcon platform={account.platform} className="w-10 h-10" withBackground />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white">{account.username}</h3>
                      <a href={account.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-1 flex items-center gap-3">
                      <span>Platform: <span className="text-white capitalize">{account.platform}</span></span>
                      <span>•</span>
                      <span>Downloaded: <span className="text-white">{account.totalDownloaded || 0}</span></span>
                      {account.lastCheckedAt && (
                        <>
                          <span>•</span>
                          <span>Checked: <span className="text-white">{formatDistanceToNow(new Date(account.lastCheckedAt), { addSuffix: true })}</span></span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{account.enabled ? 'ACTIVE' : 'PAUSED'}</span>
                    <Switch 
                      checked={account.enabled} 
                      onCheckedChange={() => handleToggle(account.id, account.enabled)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(account.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
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
  
  const createAccount = useCreateAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!platform || !username || !url) return;

    createAccount.mutate({ 
      data: { 
        platform: platform as any, 
        username, 
        url,
        enabled: true
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Account added successfully" });
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        setOpen(false);
        setUsername("");
        setUrl("");
      },
      onError: (err: any) => {
        toast({ title: "Error adding account", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-mono">
          <Plus className="w-4 h-4" />
          ADD ACCOUNT
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Monitored Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Platform</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map(p => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Username / Channel Name</label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. Marques Brownlee" required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Profile URL</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/@MKBHD" type="url" required />
          </div>
          <div className="pt-4 flex justify-end gap-2">
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
