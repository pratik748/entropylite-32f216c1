const LoadingState = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="relative mb-6">
        <div className="h-12 w-12 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-primary" />
      </div>
      <p className="text-sm font-medium text-foreground">Analyzing stock data...</p>
      <p className="mt-1 text-xs text-muted-foreground">Fetching news, running AI analysis, simulating scenarios</p>

      <div className="mt-8 w-full max-w-sm space-y-3">
        {["Fetching stock price", "Searching related news", "Analyzing sentiment", "Running simulations"].map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-2.5 text-sm"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            <div className="h-2 w-2 animate-pulse-glow rounded-full bg-primary" style={{ animationDelay: `${i * 0.3}s` }} />
            <span className="text-muted-foreground">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoadingState;
