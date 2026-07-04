import type { ReactNode } from "react";

/**
 * Shared section grammar for the public site. Every section on every page
 * opens with the same construction: an indexed rule line, an eyebrow, a
 * display headline, and an optional lede. Uniformity is the aesthetic.
 */

export function SectionIntro({
  index,
  label,
  title,
  lede,
  dark = false,
  align = "left",
  className = "",
}: {
  index?: string;
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  dark?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "text-center" : ""} ${className}`}>
      <div
        className={`flex items-center gap-3 mb-6 ${centered ? "justify-center" : ""}`}
      >
        {index && (
          <span
            className={`mkt-label ${dark ? "text-white/40" : "text-ink/35"}`}
          >
            {index}
          </span>
        )}
        <span className={`h-px w-8 ${dark ? "bg-white/25" : "bg-ink/20"}`} />
        <span className={`mkt-label ${dark ? "text-white/60" : "text-ink/55"}`}>
          {label}
        </span>
      </div>
      <h2 className={`mkt-display-2 ${dark ? "text-white" : "text-ink"}`}>
        {title}
      </h2>
      {lede && (
        <p
          className={`mkt-lede mt-5 max-w-2xl ${centered ? "mx-auto" : ""} ${
            dark ? "text-white/55" : "text-ink/55"
          }`}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

/**
 * Uniform page opener for every sub-page: ink band, engineering grid,
 * indexed eyebrow, display title, lede. One construction, everywhere.
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
    <header className="relative overflow-hidden bg-ink text-white">
      <div className="absolute inset-0 ink-grid grid-vignette" aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-14 sm:pt-20 pb-14 sm:pb-16">
        <div className="flex items-center gap-3 mb-7">
          <span className="h-px w-8 bg-white/25" />
          <span className="mkt-label text-[9px] text-white/60">{label}</span>
        </div>
        <h1 className="mkt-display text-white max-w-3xl">{title}</h1>
        {lede && (
          <p className="mkt-lede text-white/55 max-w-2xl mt-6">{lede}</p>
        )}
        {children}
      </div>
    </header>
  );
}

/** Primary action — ink block button (or white on ink sections). */
export function InkButton({
  children,
  onClick,
  dark = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  dark?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group inline-flex h-12 items-center justify-center gap-2 px-7 text-[13px] font-semibold tracking-tight transition-all duration-200 rounded-lg ${
        dark
          ? "bg-white text-ink hover:bg-white/90"
          : "bg-ink text-white hover:bg-ink-700"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Secondary action — hairline outline. */
export function LineButton({
  children,
  onClick,
  dark = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  dark?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-12 items-center justify-center gap-2 px-7 text-[13px] font-semibold tracking-tight rounded-lg border transition-all duration-200 ${
        dark
          ? "border-white/20 text-white/85 hover:border-white/45 hover:text-white"
          : "border-ink/15 text-ink/75 hover:border-ink/40 hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}
