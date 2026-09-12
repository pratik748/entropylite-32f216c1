import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Cpu, ShieldCheck } from "lucide-react";
import VenorAdminDashboard from "@/components/admin/VenorAdminDashboard";

export default function VenorSimAdminPage() {
  useEffect(() => {
    document.title = "VENOR Simulation & Hyperparameter Evolution | Entropy";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border/80 bg-card/60 backdrop-blur px-4 py-3 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Terminal Desk
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 border border-primary/20 text-primary">
                <Cpu className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                VENOR Institutional Autonomous Trade & Evolution Lab
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/api"
              className="rounded-lg border border-border/70 bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              API Key Manager
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        <VenorAdminDashboard />
      </main>
    </div>
  );
}
