import { useState } from "react";
import { useListDownloadJobs, useListUploadJobs, useRetryUploadJob, getListUploadJobsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, Image as ImageIcon, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Jobs() {
  const [activeTab, setActiveTab] = useState("downloads");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Jobs Queue</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">Monitor download processing and upload dispatching.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-[400px] grid-cols-2 bg-card border border-border h-12 p-1">
          <TabsTrigger value="downloads" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary">DOWNLOADS</TabsTrigger>
          <TabsTrigger value="uploads" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary">UPLOADS</TabsTrigger>
        </TabsList>
        <div className="mt-6 bg-card border border-border rounded-lg overflow-hidden">
          <TabsContent value="downloads" className="m-0 border-none outline-none">
            <DownloadJobsList />
          </TabsContent>
          <TabsContent value="uploads" className="m-0 border-none outline-none">
            <UploadJobsList />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function DownloadJobsList() {
  const { data: jobs, isLoading } = useListDownloadJobs();

  if (isLoading) return <div className="p-12 text-center text-muted-foreground font-mono">Loading download jobs...</div>;
  if (!Array.isArray(jobs) || !jobs.length) return <div className="p-12 text-center text-muted-foreground font-mono">No download jobs found.</div>;

  return (
    <div className="divide-y divide-border">
      {jobs.map((job) => (
        <div key={job.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-16 h-12 bg-white/5 rounded overflow-hidden flex-shrink-0 border border-border flex items-center justify-center">
              {job.thumbnailUrl ? (
                <img src={job.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <PlatformIcon platform={job.platform} className="w-4 h-4" />
                <h3 className="font-bold text-white text-sm line-clamp-1 max-w-md" title={job.originalTitle || "Unknown Video"}>
                  {job.originalTitle || "Unknown Video"}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1 flex items-center gap-3">
                <span>Account: <span className="text-white">{job.username}</span></span>
                <span>•</span>
                <span>Started: <span className="text-white">{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span></span>
                <a href={job.videoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                  <LinkIcon className="w-3 h-3" /> URL
                </a>
              </p>
              {job.errorMessage && (
                <p className="text-xs text-red-500 font-mono mt-1 max-w-lg line-clamp-1">{job.errorMessage}</p>
              )}
            </div>
          </div>
          <div>
            <StatusBadge status={job.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function UploadJobsList() {
  const { data: jobs, isLoading } = useListUploadJobs();
  const retryJob = useRetryUploadJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRetry = (id: number) => {
    retryJob.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Job Retried", description: "Upload job moved back to pending." });
        queryClient.invalidateQueries({ queryKey: getListUploadJobsQueryKey() });
      }
    });
  };

  if (isLoading) return <div className="p-12 text-center text-muted-foreground font-mono">Loading upload jobs...</div>;
  if (!Array.isArray(jobs) || !jobs.length) return <div className="p-12 text-center text-muted-foreground font-mono">No upload jobs found.</div>;

  return (
    <div className="divide-y divide-border">
      {jobs.map((job) => (
        <div key={job.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-4">
            <PlatformIcon platform={job.targetPlatform} className="w-10 h-10" withBackground />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm line-clamp-1 max-w-md" title={job.aiTitle || "Waiting for AI Title"}>
                  {job.aiTitle || <span className="text-muted-foreground italic">Waiting for AI Content...</span>}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1 flex items-center gap-3">
                <span>Target: <span className="text-white capitalize">{job.targetPlatform}</span></span>
                <span>•</span>
                <span>Created: <span className="text-white">{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span></span>
                {(job as any).scheduledAt && job.status === "pending" && (
                  <>
                    <span>•</span>
                    <span className="text-yellow-400">
                      Scheduled: <span className="text-white">{new Date((job as any).scheduledAt).toLocaleString()}</span>
                    </span>
                  </>
                )}
                {job.uploadedUrl && (
                  <>
                    <span>•</span>
                    <a href={job.uploadedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                      <LinkIcon className="w-3 h-3" /> Live Link
                    </a>
                  </>
                )}
              </p>
              {job.aiHashtags && (
                <p className="text-xs text-primary/70 font-mono mt-1 line-clamp-1">{job.aiHashtags}</p>
              )}
              {job.errorMessage && (
                <p className="text-xs text-red-500 font-mono mt-1 max-w-lg line-clamp-1">{job.errorMessage}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status={job.status} />
            {job.status === "failed" && (
              <Button variant="ghost" size="icon" onClick={() => handleRetry(job.id)} title="Retry Job">
                <RefreshCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
