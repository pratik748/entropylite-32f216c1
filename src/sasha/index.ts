/**
 * SASHA (Structural Analysis & Synthesis Heuristic Agent)
 *
 * Tier-1 Institutional Voice Quant Copilot for EntropyLite.
 */

// Master switch. SASHA is hidden from the UI for now; set true to restore
// the HUD, the header launcher, the command palette entry and the hotkeys.
export const SASHA_ENABLED = false;

export * from "./types";
export * from "./intentRouter";
export * from "./quantEngine";
export * from "./voiceEngine";
export * from "./useVoice";
export * from "./sashaPhonetics";
export * from "./SashaProvider";
export * from "./SashaOrb";
export * from "./SashaHUD";
export * from "./SashaCards";
