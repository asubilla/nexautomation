import { ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground dark flex flex-col">
      <Sidebar />
      <main className="pl-64 flex-1 flex flex-col">
        <div className="p-8 max-w-7xl mx-auto flex-1">
          {children}
        </div>
        <footer className="pl-8 pr-8 pb-5 pt-4 border-t border-border">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Nex Automation. All rights reserved.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors">Privacy Policy</a>
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors">Terms of Service</a>
              <a href="/data-deletion.html" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors">Data Deletion</a>
              <a href="/contact.html" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors">Contact Us</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
