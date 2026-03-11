import { useState } from "react";
import { AlertTriangle, Shield, Zap, MapPin, Radio, ChevronDown, ChevronUp } from "lucide-react";
import ForexVolChart from "@/components/charts/ForexVolChart";
import RiskGauge from "@/components/charts/RiskGauge";
import type { ConflictEvent, ForexEntry, HighEntropyZone } from "./GeopoliticalMap";

interface GeoData {
  conflictEvents: ConflictEvent[];
  forexVolatility: ForexEntry[];
  highEntropyZones: HighEntropyZone[];
  globalRiskScore: number;
  regimeSignal: string;
  capitalFlowDirection: string;
  safeHavenDemand?: string;
  intelligenceSummary?: string;
  keyThreats: string[];
}

interface Props {
  data: GeoData;
  selectedConflict: ConflictEvent | null;
  onSelectConflict: (c: ConflictEvent | null) => void;
  exposedTickers: string[];
}

const TYPE_BADGE: Record<string, string> = {
  war: "bg-red-500", sanctions: "bg-amber-500", unrest: "bg-orange-500",
  terrorism: "bg-red-600", trade_war: "bg-yellow-500", cyber: "bg-cyan-500", energy: "bg-orange-400",
};

export function RiskStrip({ data }: { data: GeoData }) {
  const riskHigh = data.globalRiskScore >= 55;

  const items = [
    {
      label: "Regime",
      value: data.regimeSignal,
      icon: "◆",
      color: data.regimeSignal === "crisis" ? "text-loss" : data.regimeSignal === "transition" ? "text-warning" : "text-gain",
      bg: data.regimeSignal === "crisis" ? "bg-loss/5 border-loss/20" : data.regimeSignal === "transition" ? "bg-warning/5 border-warning/20" : "bg-gain/5 border-gain/20",
    },
    {
      label: "Capital Flow",
      value: data.capitalFlowDirection,
      icon: data.capitalFlowDirection === "risk-off" ? "↓" : data.capitalFlowDirection === "risk-on" ? "↑" : "→",
      color: data.capitalFlowDirection === "risk-off" ? "text-loss" : data.capitalFlowDirection === "risk-on" ? "text-gain" : "text-warning",
      bg: data.capitalFlowDirection === "risk-off" ? "bg-loss/5 border-loss/20" : data.capitalFlowDirection === "risk-on" ? "bg-gain/5 border-gain/20" : "bg-warning/5 border-warning/20",
    },
    {
      label: "Entropy",
      value: data.highEntropyZones.length,
      suffix: " active",
      icon: "⚡",
      color: data.highEntropyZones.length >= 3 ? "text-loss" : "text-warning",
      bg: data.highEntropyZones.length >= 3 ? "bg-loss/5 border-loss/20" : "bg-warning/5 border-warning/20",
    },
    {
      label: "Conflicts",
      value: data.conflictEvents.length,
      suffix: " tracked",
      icon: "⊘",
      color: data.conflictEvents.filter(e => e.severity > 0.7).length > 2 ? "text-loss" : "text-warning",
      bg: data.conflictEvents.filter(e => e.severity > 0.7).length > 2 ? "bg-loss/5 border-loss/20" : "bg-warning/5 border-warning/20",
    },
  ];

  return (
    <div className={`glass-panel rounded-xl px-3 py-2 ${riskHigh ? "glass-glow-loss" : ""}`}>
      <div className="grid gap-2 grid-cols-[100px_1fr]">
        <div className="flex items-center justify-center">
          <RiskGauge score={data.globalRiskScore} size={90} />
        </div>
        <div className="grid gap-1.5 grid-cols-4">
          {items.map((item, i) => (
            <div key={i} className={`rounded-md border p-2 ${item.bg}`}>
              <div className="flex items-center gap-1 mb-1">
                <span className={`text-[8px] ${item.color}`}>{item.icon}</span>
                <p className="text-[7px] uppercase tracking-widest text-muted-foreground font-medium truncate">{item.label}</p>
              </div>
              <p className={`font-mono text-xs font-black uppercase leading-none ${item.color}`}>
                {item.value}
                {item.suffix && <span className="text-[7px] text-muted-foreground font-normal ml-0.5">{item.suffix}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IntelligenceBrief({ data }: { data: GeoData }) {
  const [expanded, setExpanded] = useState(false);
  if (!data.intelligenceSummary) return null;

  const summary = data.intelligenceSummary;
  const isLong = summary.length > 120;
  const displayText = !expanded && isLong ? summary.slice(0, 120) + "…" : summary;

  return (
    <div className="glass-panel glass-glow-primary rounded-xl px-3 py-2 relative">
      <div className="flex items-center gap-2 relative z-10">
        <Radio className="h-3 w-3 text-primary animate-pulse flex-shrink-0" />
        <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex-shrink-0">Intel Brief</span>
        {data.safeHavenDemand && (
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[7px] font-mono font-bold uppercase ${
            data.safeHavenDemand === "extreme" || data.safeHavenDemand === "high" ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"
          }`}>Haven: {data.safeHavenDemand}</span>
        )}
      </div>
      <p className="text-[10px] text-foreground leading-relaxed relative z-10 mt-1">
        {displayText}
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} className="ml-1 text-primary text-[9px] font-mono hover:underline inline-flex items-center gap-0.5">
            {expanded ? <>less <ChevronUp className="h-2 w-2" /></> : <>more <ChevronDown className="h-2 w-2" /></>}
          </button>
        )}
      </p>
    </div>
  );
}

export function ThreatFeed({ data, selectedConflict, onSelectConflict }: Props) {
  const [showAll, setShowAll] = useState(false);
  const MAX_VISIBLE = 6;
  const events = showAll ? data.conflictEvents : data.conflictEvents.slice(0, MAX_VISIBLE);
  const hasMore = data.conflictEvents.length > MAX_VISIBLE;

  return (
    <div className="space-y-1.5 max-h-[380px] overflow-y-auto scrollbar-hide">
      <h3 className="text-[9px] font-bold text-foreground uppercase tracking-widest sticky top-0 glass-subtle py-1 px-2 rounded-md flex items-center gap-1.5 z-10">
        <Radio className="h-2.5 w-2.5 text-loss animate-pulse" /> Intel Feed
      </h3>
      {events.map((evt, i) => {
        const isSelected = selectedConflict?.name === evt.name;
        return (
          <div key={i}
            onClick={() => onSelectConflict(isSelected ? null : evt)}
            className={`glass-card rounded-md p-2 cursor-pointer transition-all ${isSelected ? "glass-glow-loss border-loss/30" : "hover:border-primary/20"}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`h-1.5 w-1.5 rounded-full ${TYPE_BADGE[evt.type] || "bg-red-500"} ${evt.severity > 0.7 ? "animate-pulse" : ""}`} />
              <span className="text-[10px] font-bold text-foreground truncate">{evt.name}</span>
              <span className="ml-auto rounded bg-surface-3 px-1 py-0.5 text-[7px] font-mono text-muted-foreground">
                {(evt.severity * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[8px] text-muted-foreground leading-relaxed line-clamp-2">{evt.summary}</p>
            {evt.nearTradeHub && (
              <p className="text-[7px] text-warning mt-0.5 flex items-center gap-0.5">
                <MapPin className="h-2 w-2" /> {evt.nearTradeHub} ({evt.distanceKm}km)
              </p>
            )}
            {isSelected && (
              <div className="mt-1.5 pt-1.5 border-t border-border/30 space-y-1">
                {evt.escalationProb != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[7px] text-muted-foreground">Escalation:</span>
                    <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full bg-loss transition-all" style={{ width: `${evt.escalationProb * 100}%` }} />
                    </div>
                    <span className="text-[7px] font-mono text-loss font-bold">{(evt.escalationProb * 100).toFixed(0)}%</span>
                  </div>
                )}
                {evt.actionableIntel && (
                  <div className="rounded glass-subtle px-1.5 py-1">
                    <p className="text-[7px] text-primary font-bold uppercase mb-0.5">Actionable Intel</p>
                    <p className="text-[8px] text-foreground">{evt.actionableIntel}</p>
                  </div>
                )}
                {evt.affectedAssets?.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {evt.affectedAssets.map(a => (
                      <span key={a} className="rounded bg-loss/10 px-1 py-0.5 text-[7px] font-mono text-loss">{a}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {hasMore && (
        <button onClick={() => setShowAll(!showAll)} className="w-full text-center text-[8px] font-mono text-primary hover:underline py-1">
          {showAll ? `Show less` : `Show all ${data.conflictEvents.length} events`}
        </button>
      )}
    </div>
  );
}

export function ThreatsView({ data, exposedTickers }: { data: GeoData; exposedTickers: string[] }) {
  return (
    <div className="space-y-3">
      {data.keyThreats.length > 0 && (
        <div className="glass-panel rounded-xl p-3 relative">
          <h3 className="text-[9px] font-bold text-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5 relative z-10">
            <AlertTriangle className="h-3 w-3 text-loss" /> Key Global Threats
          </h3>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 relative z-10">
            {data.keyThreats.map((threat, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-secondary-foreground glass-subtle rounded-md p-2 border border-loss/10">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-loss animate-pulse" />
                {threat}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.highEntropyZones.length > 0 && (
        <div className="glass-panel glass-glow-loss rounded-xl p-3 relative">
          <h3 className="text-[9px] font-bold text-loss uppercase tracking-widest mb-2 flex items-center gap-1.5 relative z-10">
            <Zap className="h-3 w-3" /> High-Entropy Zones
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 relative z-10">
            {data.highEntropyZones.map((zone, i) => (
              <div key={i} className={`glass-card rounded-md p-2.5 border-loss/20 ${zone.severity > 0.6 ? "glass-glow-loss" : ""}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-foreground">{zone.name}</span>
                  <span className="rounded bg-loss/20 px-1.5 py-0.5 text-[8px] font-mono font-bold text-loss">⚡{zone.entropyScore.toFixed(0)}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div><p className="text-[7px] text-muted-foreground uppercase">Severity</p><p className="font-mono font-bold text-loss">{(zone.severity * 100).toFixed(0)}%</p></div>
                  <div><p className="text-[7px] text-muted-foreground uppercase">FX Stress</p><p className="font-mono font-bold text-warning">{zone.currencyStress.toFixed(1)}%</p></div>
                </div>
                {zone.affectedCurrencies?.length > 0 && (
                  <div className="flex gap-0.5 mt-1.5">
                    {zone.affectedCurrencies.map(c => <span key={c} className="rounded bg-warning/10 px-1 py-0.5 text-[7px] font-mono text-warning">{c}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {exposedTickers.length > 0 && (
        <div className="glass-panel rounded-xl p-3 relative">
          <h3 className="text-[9px] font-bold text-warning uppercase tracking-widest mb-2 flex items-center gap-1.5 relative z-10">
            <Shield className="h-3 w-3 text-loss" /> Portfolio Exposure
          </h3>
          <div className="space-y-1.5 relative z-10">
            {exposedTickers.map(t => (
              <div key={t} className="flex items-center justify-between glass-subtle rounded-md p-2">
                <span className="font-mono text-xs font-bold text-foreground">{t}</span>
                <span className="text-[9px] text-loss font-mono font-bold">⚠ EXPOSED</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ForexView({ data }: { data: GeoData }) {
  return (
    <div className="space-y-3">
      <div className="glass-panel rounded-xl p-3 relative">
        <h3 className="text-[9px] font-bold text-foreground uppercase tracking-widest mb-2 relative z-10">24h Currency Movement</h3>
        <div className="relative z-10">
          <ForexVolChart data={data.forexVolatility} />
        </div>
      </div>
      <div className="glass-panel rounded-xl p-3 relative">
        <h3 className="text-[9px] font-bold text-foreground uppercase tracking-widest mb-2 relative z-10">Global Currency Volatility</h3>
        <div className="grid gap-1.5 grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 relative z-10">
          {data.forexVolatility.map((fx, i) => (
            <div key={i} className={`glass-card rounded-md p-2 transition-all ${fx.isStressed ? "glass-glow-loss border-loss/20" : ""}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-bold text-foreground">{fx.currency}</span>
                <span className="text-[7px] text-muted-foreground">{fx.country}</span>
              </div>
              <p className="font-mono text-[10px] font-bold text-foreground">{fx.rate > 0 ? fx.rate.toFixed(fx.rate > 100 ? 0 : 2) : "—"}</p>
              <p className={`font-mono text-[9px] font-semibold ${fx.change24h >= 0 ? "text-gain" : "text-loss"}`}>
                {fx.change24h >= 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
              </p>
              {fx.isStressed && <span className="text-[7px] text-loss font-mono">⚠ STRESSED</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
