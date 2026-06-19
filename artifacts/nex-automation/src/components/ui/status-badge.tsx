import { cn } from "@/lib/utils";

type Status = "pending" | "downloading" | "uploading" | "done" | "failed";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status.toLowerCase() as Status;
  
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border",
        s === "pending" && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        (s === "downloading" || s === "uploading") && "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse",
        s === "done" && "bg-green-500/10 text-green-500 border-green-500/20",
        s === "failed" && "bg-red-500/10 text-red-500 border-red-500/20",
        className
      )}
    >
      {status.toUpperCase()}
    </span>
  );
}
