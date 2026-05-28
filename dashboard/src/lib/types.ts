export type StrategyKey =
  | "strong_buy"
  | "oversold"
  | "breakout"
  | "macd_cross"
  | "quality_oversold"
  | "near_high"
  | "mtf_buy";

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  strong_buy: "TV Strong Buy",
  oversold: "Oversold Bounce",
  breakout: "Momentum Breakout",
  macd_cross: "MACD Bullish Cross",
  quality_oversold: "Quality Oversold",
  near_high: "52w High Momentum",
  mtf_buy: "Daily+Weekly Strong Buy",
};

export const STRATEGY_DESC: Record<StrategyKey, string> = {
  strong_buy:
    "TradingView's overall technical rating ≥ 0.5 (Strong Buy) — composite of 26 indicators across moving averages and oscillators on the 1D timeframe.",
  oversold:
    "RSI(14) below 30 on the daily — potential rebound candidates. Pair with a support level or fundamental conviction before acting.",
  breakout:
    "Price above EMA20 > SMA50 > SMA200 with a positive day. Ranked by trend strength × volume confirmation.",
  macd_cross:
    "MACD line above the signal line on the daily — momentum is shifting positive. Use spread size as relative strength.",
  quality_oversold:
    "RSI(14) below 40 while the long-term trend is still up (SMA50 > SMA200) — pullbacks inside healthy uptrends, filtering out falling knives. Ranked by how oversold.",
  near_high:
    "Price within 3% of its 52-week high with a positive day — the momentum/52w-high factor. Ranked by proximity to the high.",
  mtf_buy:
    "Both the daily and weekly TradingView ratings are Strong Buy (≥ 0.5) — multi-timeframe alignment for higher-conviction entries. Ranked by the average of the two ratings.",
};

export interface StockRow {
  symbol: string;            // e.g. "AAPL"
  tvTicker: string;          // e.g. "NASDAQ:AAPL"
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  close: number | null;
  change: number | null;     // % change today
  changeAbs: number | null;
  volume: number | null;
  avgVolume10d: number | null;
  marketCap: number | null;
  pe: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  ema20: number | null;
  sma50: number | null;
  sma200: number | null;
  stochK: number | null;
  ratingAll: number | null;
  ratingAll1W: number | null;   // weekly Recommend.All
  ratingMA: number | null;
  ratingOsc: number | null;
  adx: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  high52w: number | null;
  low52w: number | null;
  // computed
  volRatio?: number | null;
  emaGapPct?: number | null;
  macdSpread?: number | null;
  pctFrom52wLow?: number | null;
  pctFrom52wHigh?: number | null;
  score?: number;
}

export interface ScanResult {
  generatedAt: string;
  universeSize: number;
  strategies: Record<StrategyKey, StockRow[]>;
}
