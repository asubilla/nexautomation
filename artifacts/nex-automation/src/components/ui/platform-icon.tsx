import { SiYoutube, SiInstagram, SiFacebook, SiTiktok } from "react-icons/si";
import { cn } from "@/lib/utils";

interface PlatformIconProps {
  platform: string;
  className?: string;
  withBackground?: boolean;
}

export function PlatformIcon({ platform, className, withBackground = false }: PlatformIconProps) {
  const p = platform.toLowerCase();
  
  if (p === "youtube") {
    return (
      <div className={cn("flex items-center justify-center", withBackground && "bg-red-500/10 p-2 rounded-md", className)}>
        <SiYoutube className="text-[#FF0000] w-full h-full" />
      </div>
    );
  }
  if (p === "instagram") {
    return (
      <div className={cn("flex items-center justify-center", withBackground && "bg-pink-500/10 p-2 rounded-md", className)}>
        <SiInstagram className="text-[#E1306C] w-full h-full" />
      </div>
    );
  }
  if (p === "facebook") {
    return (
      <div className={cn("flex items-center justify-center", withBackground && "bg-blue-500/10 p-2 rounded-md", className)}>
        <SiFacebook className="text-[#1877F2] w-full h-full" />
      </div>
    );
  }
  if (p === "tiktok") {
    return (
      <div className={cn("flex items-center justify-center", withBackground && "bg-white/5 p-2 rounded-md", className)}>
        <SiTiktok className="text-white drop-shadow-[2px_2px_0_#25F4EE] w-full h-full" />
      </div>
    );
  }
  
  return null;
}
