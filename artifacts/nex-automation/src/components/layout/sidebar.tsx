import { Activity, LayoutDashboard, Settings, Users, Youtube, CheckCircle2, ListTree } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/jobs", label: "Jobs Queue", icon: ListTree },
  { href: "/credentials", label: "Credentials", icon: CheckCircle2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 border-r border-border bg-sidebar h-screen flex flex-col fixed left-0 top-0">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3 text-primary font-mono text-xl font-bold tracking-tighter">
          <Activity className="w-6 h-6" />
          <span>NEX.AUTO</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors font-medium",
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground bg-muted/50 rounded-md">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>System Online</span>
        </div>
      </div>
    </div>
  );
}
