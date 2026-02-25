import { Activity } from "lucide-react";

const Header = () => {
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
      </div>
    </header>
  );
};

export default Header;
