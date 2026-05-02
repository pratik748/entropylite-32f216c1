import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  title: string;
  description: string;
}

interface State {
  hasError: boolean;
}

class ModuleErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.title}] render crash`, error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-loss/20 bg-loss/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-loss/10">
              <AlertTriangle className="h-4 w-4 text-loss" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{this.props.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{this.props.description}</p>
            </div>
            <Button size="sm" variant="outline" onClick={this.handleRetry}>
              Retry
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ModuleErrorBoundary;