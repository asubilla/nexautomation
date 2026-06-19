import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Placeholder pages until implemented
const Dashboard = () => <div className="text-2xl font-mono">Dashboard (Coming soon)</div>;
const Accounts = () => <div className="text-2xl font-mono">Accounts (Coming soon)</div>;
const Credentials = () => <div className="text-2xl font-mono">Credentials (Coming soon)</div>;
const Jobs = () => <div className="text-2xl font-mono">Jobs (Coming soon)</div>;
const Settings = () => <div className="text-2xl font-mono">Settings (Coming soon)</div>;

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/credentials" component={Credentials} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
