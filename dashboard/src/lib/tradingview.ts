import type { StockRow } from "./types";

const SCANNER_URL = "https://scanner.tradingview.com/america/scan";

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Origin": "https://www.tradingview.com",
  "Referer": "https://www.tradingview.com/",
};

// Column names as understood by TradingView's scanner endpoint
const COLUMNS = [
  "name",
  "description",
  "exchange",
  "sector",
  "industry",
  "close",
  "change",
  "change_abs",
  "volume",
  "average_volume_10d_calc",
  "market_cap_basic",
  "price_earnings_ttm",
  "RSI",
  "MACD.macd",
  "MACD.signal",
  "EMA20",
  "SMA50",
  "SMA200",
  "Stoch.K",
  "Recommend.All",
  "Recommend.All|1W",
  "Recommend.MA",
  "Recommend.Other",
  "ADX",
  "BB.upper",
  "BB.lower",
  "price_52_week_high",
  "price_52_week_low",
] as const;

type ColumnKey = (typeof COLUMNS)[number];

interface RawRow {
  s: string;
  d: (number | string | null)[];
}

interface RawResponse {
  data: RawRow[];
  totalCount: number;
}

function rowToStock(raw: RawRow): StockRow | null {
  if (!raw.d || raw.d.length !== COLUMNS.length) return null;
  const v = Object.fromEntries(
    COLUMNS.map((k, i) => [k, raw.d[i]]),
  ) as Record<ColumnKey, number | string | null>;

  const num = (x: number | string | null): number | null =>
    typeof x === "number" ? x : null;
  const str = (x: number | string | null): string | null =>
    typeof x === "string" && x ? x : null;

  const stock: StockRow = {
    symbol: String(v.name ?? ""),
    tvTicker: raw.s,
    name: String(v.description ?? v.name ?? ""),
    exchange: String(v.exchange ?? ""),
    sector: str(v.sector),
    industry: str(v.industry),
    close: num(v.close),
    change: num(v.change),
    changeAbs: num(v.change_abs),
    volume: num(v.volume),
    avgVolume10d: num(v.average_volume_10d_calc),
    marketCap: num(v.market_cap_basic),
    pe: num(v.price_earnings_ttm),
    rsi: num(v.RSI),
    macd: num(v["MACD.macd"]),
    macdSignal: num(v["MACD.signal"]),
    ema20: num(v.EMA20),
    sma50: num(v.SMA50),
    sma200: num(v.SMA200),
    stochK: num(v["Stoch.K"]),
    ratingAll: num(v["Recommend.All"]),
    ratingAll1W: num(v["Recommend.All|1W"]),
    ratingMA: num(v["Recommend.MA"]),
    ratingOsc: num(v["Recommend.Other"]),
    adx: num(v.ADX),
    bbUpper: num(v["BB.upper"]),
    bbLower: num(v["BB.lower"]),
    high52w: num(v.price_52_week_high),
    low52w: num(v.price_52_week_low),
  };
  return stock;
}

/**
 * Pull the top US large caps with technicals from TradingView.
 * Defaults: market cap ≥ $5B, NYSE/NASDAQ common stock, top 500 by mcap.
 */
export async function fetchUniverse(opts?: {
  rangeStart?: number;
  rangeEnd?: number;
  minMarketCap?: number;
}): Promise<StockRow[]> {
  const {
    rangeStart = 0,
    rangeEnd = 500,
    minMarketCap = 5_000_000_000,
  } = opts ?? {};

  const payload = {
    filter: [
      { left: "type", operation: "in_range", right: ["stock"] },
      {
        left: "subtype",
        operation: "in_range",
        right: ["common", "", "preferred"],
      },
      {
        left: "exchange",
        operation: "in_range",
        right: ["NYSE", "NASDAQ"],
      },
      { left: "market_cap_basic", operation: "greater", right: minMarketCap },
    ],
    markets: ["america"],
    columns: COLUMNS,
    sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
    range: [rangeStart, rangeEnd],
  };

  const res = await fetch(SCANNER_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(payload),
    // Edge/Node fetch will use the server's network — no CORS issues
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `TradingView scanner returned ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as RawResponse;
  return (data.data || []).map(rowToStock).filter((s): s is StockRow => !!s);
}

/**
 * Fetch a single ticker (one row) — used by the deep-dive page.
 */
export async function fetchTicker(tvTicker: string): Promise<StockRow | null> {
  // tvTicker like "NASDAQ:AAPL" or just "AAPL"
  const fullTicker = tvTicker.includes(":") ? tvTicker : `NASDAQ:${tvTicker}`;
  const payload = {
    symbols: { tickers: [fullTicker], query: { types: [] } },
    columns: COLUMNS,
  };
  const res = await fetch(SCANNER_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `TradingView returned ${res.status} for ${fullTicker}`,
    );
  }
  const data = (await res.json()) as RawResponse;
  const first = data.data?.[0];
  return first ? rowToStock(first) : null;
}

/**
 * Helper: try to resolve a bare symbol like "AAPL" to a real TV ticker
 * by probing NASDAQ first then NYSE.
 */
export async function resolveTicker(symbol: string): Promise<StockRow | null> {
  const s = symbol.toUpperCase().trim();
  for (const exch of ["NASDAQ", "NYSE", "AMEX"]) {
    try {
      const r = await fetchTicker(`${exch}:${s}`);
      if (r && r.close !== null) return r;
    } catch {
      /* try next */
    }
  }
  return null;
}
