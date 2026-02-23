import { Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpgradeModal = ({ isOpen, onClose }: UpgradeModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl animate-slide-up">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 glow-primary">
            <Zap className="h-8 w-8 text-primary" />
          </div>
        </div>

        <h3 className="mb-2 text-center text-xl font-bold text-foreground">
          Daily Limit Reached
        </h3>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          You've used all 50 free simulations today. Upgrade to Entropy Pro for unlimited analyses.
        </p>

        <div className="mb-6 space-y-3 rounded-lg bg-surface-2 p-4">
          {["Unlimited daily simulations", "Priority API access", "Portfolio tracking", "Email alerts"].map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-secondary-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {f}
            </div>
          ))}
        </div>

        <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
          Upgrade to Pro — ₹499/mo
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Razorpay / Stripe integration coming soon
        </p>
      </div>
    </div>
  );
};

export default UpgradeModal;
