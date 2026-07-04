import type { ReactNode } from "react";

/**
 * Shared section grammar for the public site — fixed institutional dark.
 *
 * Every section opens with the same construction: an indexed rule line,
 * a mono eyebrow, a display headline, an optional lede. Panels are flat
 * carbon surfaces separated by hairlines; corners are square; elevation
 * is a surface step, never a shadow. Uniformity is the aesthetic.
 */

export function SectionIntro({
  index,
  label,
  title,
  lede,
  align = "left",
  className = "",
}: {
  index?: string;
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  /** kept for call-site compatibility; the system is dark-only */
  dark?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "text-center" : ""} ${className}`}>
      <div className={`flex items-center gap-3 mb-6 ${centered ? "justify-center" : ""}`}>
        {index && <span className="mkt-label text-[10px] text-white/30">{index}</span>}
        <span className="h-px w-8 bg-hairline-strong" />
        <span className="mkt-label text-[10px] text-white/55">{label}</span>
      </div>
      <h2 className="mkt-display-2 text-white">{title}</h2>
      {lede && (
        <p className={`mkt-lede mt-5 max-w-2xl text-white/50 ${centered ? "mx-auto" : ""}`}>
          {lede}
        </p>
      )}
    </div>
  );
}

/**
 * Uniform page opener for every sub-page: carbon band, indexed eyebrow,
 * display title, lede. One construction, everywhere.
 */
export function PageHeader({
  label,
  title,
  lede,
  children,
}: {
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="bg-carbon-950 text-white border-b border-hairline">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-14 sm:pb-16">
        <div className="flex items-center gap-3 mb-7">
          <span className="h-px w-8 bg-hairline-strong" />
          <span className="mkt-label text-[10px] text-white/55">{label}</span>
        </div>
        <h1 className="mkt-display text-white max-w-3xl">{title}</h1>
        {lede && <p className="mkt-lede text-white/50 max-w-2xl mt-6">{lede}</p>}
        {children}
      </div>
    </header>
  );
}

/** Primary action — solid white block, square corners. */
export function InkButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  /** kept for call-site compatibility; the system is dark-only */
  dark?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group inline-flex h-11 items-center justify-center gap-2 px-7 text-[13px] font-semibold tracking-tight bg-white text-carbon-950 hover:bg-white/85 transition-colors duration-150 ease-out ${className}`}
    >
      {children}
    </button>
  );
}

/** Secondary action — hairline outline, square corners. */
export function LineButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  /** kept for call-site compatibility; the system is dark-only */
  dark?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 px-7 text-[13px] font-medium tracking-tight border border-hairline-strong text-white/75 hover:border-white/40 hover:text-white transition-colors duration-150 ease-out ${className}`}
    >
      {children}
    </button>
  );
}
