import { AlertTriangle, Shield, Zap, MapPin, Radio } from "lucide-react";
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
  const items = [
    { label: "Regime", value: data.regimeSignal, color: data.regimeSignal === "crisis" ? "text-loss" : (data.regimeSignal === "transition" && data.globalRiskScore >= 50) ? "text-loss" : data.regimeSignal === "transition" ? "text-warning" : "text-gain" },
    { label: "Capital Flow", value: data.capitalFlowDirection, color: data.capitalFlowDirection === "risk-off" ? "text-loss" : data.capitalFlowDirection === "risk-on" ? "text-gain" : "text-warning" },
    { label: "Entropy Zones", value: data.highEntropyZones.length, suffix: " ACTIVE", color: data.highEntropyZones.length >= 3 ? "text-loss" : "text-warning" },
  ];
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
      {/* Risk Gauge */}
      <div className="glass-card rounded-xl p-3 sm:p-4 relative z-10 flex items-center justify-center">
        <RiskGauge score={data.globalRiskScore} />
      </div>
      {items.map((item, i) => (
        <div key={i} className="glass-card rounded-xl p-3 sm:p-4 relative z-10">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
          <p className={`font-mono text-lg sm:text-xl font-black uppercase mt-1 ${item.color}`}>
            {item.value}{item.suffix && <span className="text-[9px] text-muted-foreground ml-1">{item.suffix}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

export function IntelligenceBrief({ data }: { data: GeoData }) {
  if (!data.intelligenceSummary) return null;
  return (
    <div className="glass-panel glass-glow-primary rounded-xl p-3 sm:p-4 relative">
      <div className="flex items-center gap-2 mb-1 relative z-10">
        <Radio className="h-3 w-3 text-primary animate-pulse" />
        <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Intelligence Brief</span>
        {data.safeHavenDemand && (
          <span className={`ml-auto rounded px-2 py-0.5 text-[8px] font-mono font-bold uppercase ${
            data.safeHavenDemand === "extreme" || data.safeHavenDemand === "high" ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"
          }`}>Safe Haven: {data.safeHavenDemand}</span>
        )}
      </div>
      <p className="text-xs sm:text-sm text-foreground leading-relaxed relative z-10">{data.intelligenceSummary}</p>
    </div>
  );
}

export function ThreatFeed({ data, selectedConflict, onSelectConflict }: Props) {
  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-hide">
      <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest sticky top-0 glass-subtle py-1.5 px-2 rounded-lg flex items-center gap-2 z-10">
        <Radio className="h-3 w-3 text-loss animate-pulse" /> Active Intel Feed
      </h3>
      {data.conflictEvents.map((evt, i) => {
        const isSelected = selectedConflict?.name === evt.name;
        return (
          <div key={i}
            onClick={() => onSelectConflict(isSelected ? null : evt)}
            className={`glass-card rounded-lg p-2.5 sm:p-3 cursor-pointer transition-all ${isSelected ? "glass-glow-loss border-loss/30" : "hover:border-primary/20"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`h-2 w-2 rounded-full ${TYPE_BADGE[evt.type] || "bg-red-500"} ${evt.severity > 0.7 ? "animate-pulse" : ""}`} />
              <span className="text-[11px] font-bold text-foreground truncate">{evt.name}</span>
              <span className="ml-auto rounded bg-surface-3 px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">
                {(evt.severity * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground leading-relaxed line-clamp-2">{evt.summary}</p>
            {evt.nearTradeHub && (
              <p className="text-[8px] text-warning mt-1 flex items-center gap-1">
                <MapPin className="h-2 w-2" /> {evt.nearTradeHub} ({evt.distanceKm}km)
              </p>
            )}
            {isSelected && (
              <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
                {evt.escalationProb != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] text-muted-foreground">Escalation:</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full bg-loss transition-all" style={{ width: `${evt.escalationProb * 100}%` }} />
                    </div>
                    <span className="text-[8px] font-mono text-loss font-bold">{(evt.escalationProb * 100).toFixed(0)}%</span>
                  </div>
                )}
                {evt.actionableIntel && (
                  <div className="rounded glass-subtle px-2 py-1.5">
                    <p className="text-[8px] text-primary font-bold uppercase mb-0.5">Actionable Intel</p>
                    <p className="text-[9px] text-foreground">{evt.actionableIntel}</p>
                  </div>
                )}
                {evt.affectedAssets?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {evt.affectedAssets.map(a => (
                      <span key={a} className="rounded bg-loss/10 px-1.5 py-0.5 text-[8px] font-mono text-loss">{a}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ThreatsView({ data, exposedTickers }: { data: GeoData; exposedTickers: string[] }) {
  return (
    <div className="space-y-4">
      {data.keyThreats.length > 0 && (
        <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
            <AlertTriangle className="h-3.5 w-3.5 text-loss" /> Key Global Threats
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 relative z-10">
            {data.keyThreats.map((threat, i) => (
              <div key={i} className="flex items-start gap-2 text-xs sm:text-sm text-secondary-foreground glass-subtle rounded-lg p-3 border border-loss/10">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-loss animate-pulse" />
                {threat}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.highEntropyZones.length > 0 && (
        <div className="glass-panel glass-glow-loss rounded-xl p-4 sm:p-5 relative">
          <h3 className="text-[10px] font-bold text-loss uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
            <Zap className="h-3.5 w-3.5" /> High-Entropy Zones
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 relative z-10">
            {data.highEntropyZones.map((zone, i) => (
              <div key={i} className={`glass-card rounded-lg p-3 sm:p-4 border-loss/20 ${zone.severity > 0.6 ? "glass-glow-loss animate-pulse-subtle" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs sm:text-sm font-bold text-foreground">{zone.name}</span>
                  <span className="rounded bg-loss/20 px-2 py-0.5 text-[9px] font-mono font-bold text-loss">⚡{zone.entropyScore.toFixed(0)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-[8px] text-muted-foreground uppercase">Severity</p><p className="font-mono font-bold text-loss">{(zone.severity * 100).toFixed(0)}%</p></div>
                  <div><p className="text-[8px] text-muted-foreground uppercase">FX Stress</p><p className="font-mono font-bold text-warning">{zone.currencyStress.toFixed(1)}%</p></div>
                </div>
                {zone.affectedCurrencies?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {zone.affectedCurrencies.map(c => <span key={c} className="rounded bg-warning/10 px-1.5 py-0.5 text-[8px] font-mono text-warning">{c}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {exposedTickers.length > 0 && (
        <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
          <h3 className="text-[10px] font-bold text-warning uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
            <Shield className="h-3.5 w-3.5" /> Portfolio Exposure
          </h3>
          <div className="space-y-2 relative z-10">
            {exposedTickers.map(t => (
              <div key={t} className="flex items-center justify-between glass-subtle rounded-lg p-3">
                <span className="font-mono text-sm font-bold text-foreground">{t}</span>
                <span className="text-[10px] text-warning font-mono">EXPOSED</span>
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
    <div className="space-y-4">
      {/* Forex Volatility Bar Chart */}
      <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
        <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 relative z-10">24h Currency Movement</h3>
        <div className="relative z-10">
          <ForexVolChart data={data.forexVolatility} />
        </div>
      </div>

      {/* Currency Cards */}
      <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
        <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 relative z-10">Global Currency Volatility</h3>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 relative z-10">
          {data.forexVolatility.map((fx, i) => (
            <div key={i} className={`glass-card rounded-lg p-3 transition-all ${fx.isStressed ? "glass-glow-loss border-loss/20" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-foreground">{fx.currency}</span>
                <span className="text-[8px] text-muted-foreground">{fx.country}</span>
              </div>
              <p className="font-mono text-sm font-bold text-foreground">{fx.rate > 0 ? fx.rate.toFixed(fx.rate > 100 ? 0 : 2) : "—"}</p>
              <p className={`font-mono text-xs font-semibold ${fx.change24h >= 0 ? "text-gain" : "text-loss"}`}>
                {fx.change24h >= 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
              </p>
              {fx.isStressed && <span className="text-[8px] text-loss font-mono mt-1 block">⚠ STRESSED</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
