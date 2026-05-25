/**
 * Yahoo Finance historical bars.
 *
 * Uses the public chart endpoint:
 *   https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}
 *
 * Cached in-memory for the lifetime of the server process.
 */

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

// symbol -> { fetchedAt, closes, volumes }
const cache = new Map<
  string,
  {
    fetchedAt: number;
    closes: Record<string, number>;
    volumes: Record<string, number>;
  }
>();
const TTL_MS = 30 * 60 * 1000; // 30 min

function toDateStr(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  // Use UTC to keep daily buckets stable
  return (
    d.getUTCFullYear() +
    "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

/**
 * Fetch daily bars (closes + volumes) for a symbol from Yahoo. Single network
 * call hydrates both maps; downstream functions slice off whichever they need.
 */
async function hydrateBars(symbol: string, range: string): Promise<{
  closes: Record<string, number>;
  volumes: Record<string, number>;
}> {
  const key = `${symbol.toUpperCase()}|${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
    return { closes: hit.closes, volumes: hit.volumes };
  }

  // Yahoo accepts plain ticker (no exchange prefix). Class/preferred shares
  // use "-" instead of "." or "/" (e.g. BRK.B → BRK-B, ALL/PI → ALL-PI).
  const yahooSym = symbol.replace(/[./]/g, "-").toUpperCase();
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}` +
    `?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false`;

  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Yahoo ${res.status} for ${yahooSym}`);
  }
  const j = (await res.json()) as {
    chart: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }>;
      error?: { code: string; description: string };
    };
  };
  if (j.chart.error) {
    throw new Error(`Yahoo: ${j.chart.error.description}`);
  }
  const r = j.chart.result?.[0];
  if (!r || !r.timestamp || !r.indicators?.quote?.[0]?.close) {
    return { closes: {}, volumes: {} };
  }

  const ts = r.timestamp;
  const closeArr = r.indicators.quote[0].close ?? [];
  const volArr = r.indicators.quote[0].volume ?? [];
  const closes: Record<string, number> = {};
  const volumes: Record<string, number> = {};
  for (let i = 0; i < ts.length; i++) {
    const c = closeArr[i];
    if (typeof c === "number" && Number.isFinite(c)) {
      const day = toDateStr(ts[i]);
      closes[day] = c;
      const v = volArr[i];
      volumes[day] = typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
  }
  cache.set(key, { fetchedAt: Date.now(), closes, volumes });
  return { closes, volumes };
}

/**
 * Fetch daily closes for a symbol. Returns { 'YYYY-MM-DD': close }.
 * Range is one of Yahoo's accepted ranges: 1mo, 3mo, 6mo, 1y, 2y, 5y, max.
 */
export async function fetchDailyCloses(
  symbol: string,
  range: string = "6mo",
): Promise<Record<string, number>> {
  const { closes } = await hydrateBars(symbol, range);
  return closes;
}

/**
 * Fetch daily bars (closes + volumes) for a symbol. Single Yahoo call,
 * shared cache with `fetchDailyCloses`.
 */
export async function fetchDailyBars(
  symbol: string,
  range: string = "6mo",
): Promise<{
  closes: Record<string, number>;
  volumes: Record<string, number>;
}> {
  return hydrateBars(symbol, range);
}

/**
 * Fetch closes for many symbols in parallel.
 */
export async function fetchManyDailyCloses(
  symbols: string[],
  range = "6mo",
): Promise<Record<string, Record<string, number>>> {
  const results = await Promise.allSettled(
    symbols.map(async (s) => [s, await fetchDailyCloses(s, range)] as const),
  );
  const out: Record<string, Record<string, number>> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [sym, closes] = r.value;
      out[sym.toUpperCase()] = closes;
    }
  }
  return out;
}

/**
 * Bulk fetch closes + volumes for many symbols with bounded concurrency to
 * avoid hammering Yahoo when warming the cache for a backtest universe.
 */
export async function fetchManyDailyBars(
  symbols: string[],
  range = "2y",
  concurrency = 12,
): Promise<
  Record<string, { closes: Record<string, number>; volumes: Record<string, number> }>
> {
  const out: Record<
    string,
    { closes: Record<string, number>; volumes: Record<string, number> }
  > = {};
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < symbols.length) {
      const idx = cursor++;
      const sym = symbols[idx];
      try {
        out[sym.toUpperCase()] = await fetchDailyBars(sym, range);
      } catch {
        // Skip — engine treats missing symbols as filtered out.
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, symbols.length) }, worker),
  );
  return out;
}

/**
 * Returns the list of trading-day strings between startDate and endDate
 * (inclusive) based on the union of dates present in `closesBySymbol`.
 *
 * Falls back to a simple weekday range when no closes are available.
 */
export function tradingDaysBetween(
  startDate: string,
  endDate: string,
  closesBySymbol: Record<string, Record<string, number>>,
): string[] {
  const all = new Set<string>();
  for (const closes of Object.values(closesBySymbol)) {
    for (const d of Object.keys(closes)) {
      if (d >= startDate && d <= endDate) all.add(d);
    }
  }
  if (all.size === 0) {
    // Fallback: weekday range
    const out: string[] = [];
    const start = new Date(startDate + "T00:00:00Z");
    const end = new Date(endDate + "T00:00:00Z");
    for (
      let d = new Date(start);
      d.getTime() <= end.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dow = d.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        out.push(d.toISOString().slice(0, 10));
      }
    }
    return out;
  }
  return Array.from(all).sort();
}
