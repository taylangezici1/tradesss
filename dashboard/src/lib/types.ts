export type StrategyKey = "strong_buy" | "oversold" | "breakout" | "macd_cross";

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  strong_buy: "TV Strong Buy",
  oversold: "Oversold Bounce",
  breakout: "Momentum Breakout",
  macd_cross: "MACD Bullish Cross",
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
