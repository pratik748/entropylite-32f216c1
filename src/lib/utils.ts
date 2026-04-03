import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Strip markdown artifacts from AI-generated text for clean terminal display */
export function cleanAIText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // **bold** → bold
    .replace(/\*([^*]+)\*/g, "$1")        // *italic* → italic
    .replace(/__([^_]+)__/g, "$1")        // __bold__ → bold
    .replace(/_([^_]+)_/g, "$1")          // _italic_ → italic
    .replace(/^#{1,6}\s+/gm, "")          // # headers → plain
    .replace(/^[-*+]\s+/gm, "• ")         // markdown bullets → clean bullet
    .replace(/`([^`]+)`/g, "$1")          // `code` → code
    .replace(/~~([^~]+)~~/g, "$1")        // ~~strike~~ → plain
    .replace(/\n{3,}/g, "\n\n")           // collapse excess newlines
    .trim();
}
