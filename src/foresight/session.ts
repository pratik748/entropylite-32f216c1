/**
 * Conversational session state.
 *
 * Keeps what the planner needs to resolve "run that again", "compare it
 * with yesterday", "explain the second point" — entity slots, a compacted
 * turn ledger, and the last full reasoning graph (kept client-side so
 * follow-ups never re-fetch what is already known).
 */

import type { FactRecord, ReasoningGraph } from "./types";

export interface TurnDigest {
  role: "user" | "foresight";
  text: string;
  /** Tools invoked during this turn (foresight turns only). */
  tools?: string[];
  at: number;
}

const MAX_TURNS = 24;

export class ForesightSession {
  turns: TurnDigest[] = [];
  /** Most-recently-referenced tickers, newest first. */
  activeTickers: string[] = [];
  lastComparison: [string, string] | null = null;
  lastScenario: string | null = null;
  lastOptimizer: string | null = null;
  lastGraph: ReasoningGraph | null = null;
  lastFacts: FactRecord[] = [];
  /** Timestamp anchor for "since yesterday" style diffs. */
  lastSnapshotAt: number | null = null;

  noteUser(text: string): void {
    this.turns.push({ role: "user", text: text.slice(0, 500), at: Date.now() });
    this.trim();
  }

  noteForesight(text: string, tools: string[]): void {
    this.turns.push({ role: "foresight", text: text.slice(0, 500), tools, at: Date.now() });
    this.trim();
  }

  noteTickers(tickers: string[]): void {
    for (const t of tickers) {
      const up = t.toUpperCase();
      this.activeTickers = [up, ...this.activeTickers.filter((x) => x !== up)].slice(0, 8);
    }
    if (tickers.length >= 2) this.lastComparison = [tickers[0].toUpperCase(), tickers[1].toUpperCase()];
  }

  private trim(): void {
    if (this.turns.length > MAX_TURNS) this.turns.splice(0, this.turns.length - MAX_TURNS);
  }

  /**
   * Compact context block for the planner prompt. Full results stay
   * client-side; the planner sees digests plus resolvable entity slots.
   */
  toPromptContext(): string {
    const lines: string[] = [];
    if (this.activeTickers.length) lines.push(`active_tickers: ${this.activeTickers.join(", ")}`);
    if (this.lastComparison) lines.push(`last_comparison: ${this.lastComparison.join(" vs ")}`);
    if (this.lastScenario) lines.push(`last_scenario: ${this.lastScenario}`);
    if (this.lastOptimizer) lines.push(`last_optimizer: ${this.lastOptimizer}`);
    if (this.lastGraph) {
      const tools = this.lastGraph.steps.map((s) => s.tool).join(", ");
      lines.push(`last_run: goal="${this.lastGraph.goal.slice(0, 120)}" tools=[${tools}]`);
    }
    const recent = this.turns.slice(-10).map((t) => `${t.role}: ${t.text.slice(0, 220)}`);
    if (recent.length) lines.push("recent_turns:", ...recent);
    return lines.join("\n");
  }
}
