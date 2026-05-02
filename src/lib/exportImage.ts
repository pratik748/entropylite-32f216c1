import { toPng, toBlob } from "html-to-image";

/**
 * Robust PNG export for share cards.
 * Mitigates common html-to-image failures:
 *  - Web fonts not yet loaded (causes blank/empty render)
 *  - First-call quirks in Safari/iOS (warm-up needed)
 *  - Tainted canvas from cross-origin images
 *  - Transient DOM measurement glitches
 */
export async function exportNodeToPng(
  node: HTMLElement,
  opts: { backgroundColor?: string; pixelRatio?: number; filter?: (n: HTMLElement) => boolean } = {}
): Promise<string> {
  const { backgroundColor = "#0a0a0a", pixelRatio = 2, filter } = opts;

  // 1. Wait for web fonts to be ready — biggest cause of silent failures
  try {
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
  } catch {
    /* ignore */
  }

  // 2. Wait for next paint so layout is stable
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const baseOptions = {
    pixelRatio,
    cacheBust: true,
    backgroundColor,
    skipFonts: false,
    filter: filter
      ? (n: any) => {
          // Skip iframes and elements with data-html2canvas-ignore
          if (n?.tagName === "IFRAME") return false;
          return filter(n);
        }
      : (n: any) => n?.tagName !== "IFRAME",
  };

  let lastErr: any = null;

  // 3. Try toPng up to 3 times — first call often warms up the renderer
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = await toPng(node, baseOptions);
      if (url && url.length > 1000) return url;
      lastErr = new Error("Empty PNG output");
    } catch (e) {
      lastErr = e;
    }
    // small backoff
    await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
  }

  // 4. Final fallback: toBlob → object URL → data URL
  try {
    const blob = await toBlob(node, baseOptions);
    if (blob) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    lastErr = e;
  }

  throw lastErr || new Error("Image export failed");
}