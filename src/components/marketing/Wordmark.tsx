import wordmarkBlack from "@/assets/entropy-wordmark-black.png";
import wordmarkWhite from "@/assets/entropy-wordmark-white.png";

/**
 * Brand system for the public site — the ENTROPY blackletter wordmark,
 * supplied as tight-cropped transparent assets in ink and white.
 */

export const WORDMARK_BLACK = wordmarkBlack;
export const WORDMARK_WHITE = wordmarkWhite;

/** Small standalone mark for compact chrome (auth card, reading header). */
export function EntropyGlyph({
  className = "h-8 w-auto",
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  return (
    <img
      src={light ? wordmarkWhite : wordmarkBlack}
      alt="Entropy"
      className={`${className} mkt-logo select-none`}
      draggable={false}
    />
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
    <span className="inline-flex flex-col items-start select-none">
      <img
        src={light ? wordmarkWhite : wordmarkBlack}
        alt="Entropy"
        className={`${compact ? "h-7" : "h-9"} w-auto mkt-logo`}
        draggable={false}
      />
      {!compact && (
        <span
          className={`mt-1.5 font-mono text-[7.5px] font-medium tracking-[0.34em] uppercase ${
            light ? "text-white/45" : "text-ink/45"
          }`}
        >
          Market Intelligence
        </span>
      )}
    </span>
  );
}
