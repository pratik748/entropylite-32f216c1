import entropyLogo from "@/assets/entropy-logo.png";

const Header = () => {
  return (
    <header className="border-b border-border bg-surface-1">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={entropyLogo} alt="Entropy" className="h-10 object-contain" />
        </div>
      </div>
    </header>
  );
};

export default Header;
