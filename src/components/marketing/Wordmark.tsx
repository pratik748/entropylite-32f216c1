/**
 * Typographic brand system for the public site.
 * A precise, engineered mark — four bars collapsing into order — plus a
 * letterspaced wordmark. Renders in ink on paper, or white on ink.
 */

export function EntropyGlyph({
  className = "h-6 w-6",
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  const bg = light ? "#FFFFFF" : "#0A0F1A";
  const fg = light ? "#0A0F1A" : "#FFFFFF";
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect x="0" y="0" width="28" height="28" rx="7" fill={bg} />
      <rect x="7" y="7.5" width="14" height="2.1" rx="1.05" fill={fg} />
      <rect x="7" y="12.95" width="10.5" height="2.1" rx="1.05" fill={fg} opacity="0.78" />
      <rect x="7" y="18.4" width="6.5" height="2.1" rx="1.05" fill={fg} opacity="0.5" />
    </svg>
  );
}

export default function Wordmark({
  light = false,
  compact = false,
}: {
  light?: boolean;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <EntropyGlyph className={compact ? "h-6 w-6" : "h-7 w-7"} light={light} />
      <span className="flex flex-col leading-none">
        <span
          className={`font-semibold tracking-[0.18em] ${compact ? "text-[13px]" : "text-[14px]"} ${
            light ? "text-white" : "text-ink"
          }`}
        >
          ENTROPY
        </span>
        {!compact && (
          <span
            className={`mt-1 font-mono text-[8px] font-medium tracking-[0.3em] uppercase ${
              light ? "text-white/45" : "text-ink/45"
            }`}
          >
            Market Intelligence
          </span>
        )}
      </span>
    </span>
  );
}
