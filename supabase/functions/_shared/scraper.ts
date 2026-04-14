/**
 * Shared scraping utility — native HTML fetch first, ScrapeGraph AI fallback.
 * Saves ScrapeGraph credits by trying free HTML scraping first.
 */

const SCRAPEGRAPH_API = "https://api.scrapegraphai.com/v1/smartscraper";

interface ScrapeResult {
  content: string;
  source: "html" | "scrapegraph";
  error?: string;
}

/** Strip HTML tags, decode entities, collapse whitespace */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract structured article data from raw HTML */
function extractArticlesFromHTML(html: string): { title: string; text: string }[] {
  const articles: { title: string; text: string }[] = [];

  // Try <article> tags first
  const articleRegex = /<article[\s\S]*?<\/article>/gi;
  let match;
  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[0];
    const titleMatch = block.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const title = titleMatch ? htmlToText(titleMatch[1]) : "";
    const text = htmlToText(block);
    if (title && text.length > 50) {
      articles.push({ title, text: text.slice(0, 2000) });
    }
  }

  // Fallback: extract from main/body
  if (articles.length === 0) {
    const mainMatch = html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*?<\/body>/i);
    if (mainMatch) {
      const text = htmlToText(mainMatch[0]);
      if (text.length > 100) {
        articles.push({ title: "", text: text.slice(0, 5000) });
      }
    }
  }

  return articles;
}

/** Extract meta/og tags from HTML */
function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const metaRegex = /<meta\s+(?:[^>]*?(?:name|property)=["']([^"']+)["'][^>]*?content=["']([^"']+)["']|[^>]*?content=["']([^"']+)["'][^>]*?(?:name|property)=["']([^"']+)["'])[^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(html)) !== null) {
    const key = (m[1] || m[4] || "").toLowerCase();
    const val = m[2] || m[3] || "";
    if (key && val) meta[key] = val;
  }
  return meta;
}

/** Attempt native HTML fetch (free, no API credits) */
export async function scrapeHTML(url: string, timeoutMs = 10000): Promise<ScrapeResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EntropyBot/2.0; +https://entropylite.lovable.app)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = htmlToText(html);
    if (text.length < 100) throw new Error("Insufficient content extracted");
    return { content: text.slice(0, 8000), source: "html" };
  } catch (e: any) {
    return { content: "", source: "html", error: e.message };
  }
}

/** ScrapeGraph AI smartscraper — structured extraction with credits */
export async function scrapeWithScrapeGraph(
  url: string,
  prompt: string,
  outputSchema?: Record<string, any>,
): Promise<ScrapeResult> {
  const apiKey = Deno.env.get("SCRAPEGRAPH_API_KEY");
  if (!apiKey) {
    return { content: "", source: "scrapegraph", error: "SCRAPEGRAPH_API_KEY not set" };
  }
  try {
    const body: Record<string, any> = {
      website_url: url,
      user_prompt: prompt,
    };
    if (outputSchema) body.output_schema = outputSchema;

    const res = await fetch(SCRAPEGRAPH_API, {
      method: "POST",
      headers: {
        "SGAI-APIKEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ScrapeGraph ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
    return { content, source: "scrapegraph" };
  } catch (e: any) {
    return { content: "", source: "scrapegraph", error: e.message };
  }
}

/** 
 * Smart scrape: try free HTML first, fall back to ScrapeGraph for premium/paywalled content.
 * Only burns ScrapeGraph credits if HTML scraping fails or returns thin content.
 */
export async function smartScrape(
  url: string,
  prompt: string,
  opts?: { minContentLength?: number; outputSchema?: Record<string, any> }
): Promise<ScrapeResult> {
  const minLen = opts?.minContentLength ?? 200;

  // Step 1: Free HTML scrape
  const htmlResult = await scrapeHTML(url);
  if (!htmlResult.error && htmlResult.content.length >= minLen) {
    return htmlResult;
  }

  // Step 2: ScrapeGraph fallback (uses credits)
  console.log(`HTML scrape insufficient for ${url} (${htmlResult.content.length} chars), using ScrapeGraph`);
  const sgResult = await scrapeWithScrapeGraph(url, prompt, opts?.outputSchema);
  if (!sgResult.error && sgResult.content.length > 0) {
    return sgResult;
  }

  // Return whatever we got
  return htmlResult.content.length > sgResult.content.length ? htmlResult : sgResult;
}

/** Batch scrape multiple URLs with concurrency limit */
export async function batchScrape(
  urls: { url: string; prompt: string }[],
  concurrency = 3,
): Promise<Map<string, ScrapeResult>> {
  const results = new Map<string, ScrapeResult>();
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async ({ url, prompt }) => {
        const result = await smartScrape(url, prompt);
        return { url, result };
      })
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.set(r.value.url, r.value.result);
      }
    }
  }
  return results;
}

/** Scrape financial news from premium sources */
export async function scrapePremiumNews(ticker: string): Promise<{
  articles: { title: string; summary: string; source: string; url: string; sentiment?: string }[];
  scrapedSources: string[];
}> {
  const premiumUrls = [
    { url: `https://www.bloomberg.com/quote/${ticker}:US`, name: "Bloomberg" },
    { url: `https://www.wsj.com/market-data/quotes/${ticker}`, name: "WSJ" },
    { url: `https://www.ft.com/stream?q=${ticker}`, name: "Financial Times" },
    { url: `https://www.reuters.com/companies/${ticker}.O`, name: "Reuters" },
    { url: `https://finance.yahoo.com/quote/${ticker}/news/`, name: "Yahoo Finance" },
    { url: `https://seekingalpha.com/symbol/${ticker}/news`, name: "Seeking Alpha" },
  ];

  const articles: { title: string; summary: string; source: string; url: string; sentiment?: string }[] = [];
  const scrapedSources: string[] = [];

  const prompt = `Extract all news article headlines and brief summaries about ${ticker} stock. For each article return: title, summary (1-2 sentences), and sentiment (positive/negative/neutral).`;

  const results = await Promise.allSettled(
    premiumUrls.map(async ({ url, name }) => {
      const result = await smartScrape(url, prompt, { minContentLength: 100 });
      return { name, url, result };
    })
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { name, url, result } = r.value;
    if (result.error || result.content.length < 50) continue;
    scrapedSources.push(name);

    // Try to parse structured data
    try {
      const parsed = JSON.parse(result.content);
      const items = Array.isArray(parsed) ? parsed : parsed.articles || parsed.news || [parsed];
      for (const item of items) {
        if (item.title) {
          articles.push({
            title: item.title,
            summary: item.summary || item.description || "",
            source: name,
            url,
            sentiment: item.sentiment,
          });
        }
      }
    } catch {
      // Treat as raw text — extract headlines heuristically
      const lines = result.content.split(/[.\n]/).filter((l: string) => l.trim().length > 20 && l.trim().length < 200);
      for (const line of lines.slice(0, 5)) {
        articles.push({
          title: line.trim(),
          summary: "",
          source: name,
          url,
        });
      }
    }
  }

  return { articles, scrapedSources };
}

/** Scrape company fundamentals from public financial pages */
export async function scrapeCompanyData(ticker: string): Promise<string> {
  const sources = [
    `https://finance.yahoo.com/quote/${ticker}/profile/`,
    `https://finance.yahoo.com/quote/${ticker}/financials/`,
    `https://finance.yahoo.com/quote/${ticker}/holders/`,
    `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/company/`,
  ];

  const chunks: string[] = [];

  const results = await Promise.allSettled(
    sources.map(url => scrapeHTML(url, 12000))
  );

  for (const r of results) {
    if (r.status === "fulfilled" && !r.value.error && r.value.content.length > 100) {
      chunks.push(r.value.content.slice(0, 3000));
    }
  }

  if (chunks.length === 0) {
    // Fallback to ScrapeGraph for one rich source
    const sg = await scrapeWithScrapeGraph(
      `https://finance.yahoo.com/quote/${ticker}/`,
      `Extract all available company information for ${ticker}: sector, industry, market cap, employees, revenue, key executives, institutional holders, and recent news headlines.`,
    );
    if (!sg.error) chunks.push(sg.content.slice(0, 5000));
  }

  return chunks.join("\n\n---\n\n");
}
