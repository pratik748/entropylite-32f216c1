import { Activity, Zap } from "lucide-react";

const Header = ({ usageCount = 0 }: { usageCount?: number }) => {
  return (
    <header className="border-b border-border bg-surface-1">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 glow-primary">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Entropy Lite
            </h1>
            <p className="text-xs text-muted-foreground">by Pratik</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
            <Zap className="h-3.5 w-3.5 text-warning" />
            <span className="font-mono text-muted-foreground">
              {usageCount}/5 free today
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
