import entropyLogo from "@/assets/entropy-logo.png";

const Header = () => {
  return (
    <header className="border-b border-border bg-surface-1">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <img alt="Entropy" className="h-10 object-contain" src="/lovable-uploads/9357bd58-6be2-4fd2-97f0-ac56eb56f217.jpg" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
            Created by <span className="text-foreground font-semibold">Pratik Sehwag</span>
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
