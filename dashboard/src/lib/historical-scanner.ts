/**
 * Historical scanner — reconstructs the same strategy buckets that
 * `lib/strategies.ts` produces from live TradingView data, but using
 * indicator series derived from cached Yahoo daily bars.
 *
 * Three strategies are reconstructable from price/volume alone:
 *   - oversold:   RSI(14) < 30
 *   - breakout:   close > EMA20 > SMA50 > SMA200 AND change > 0
 *   - macd_cross: MACD > signal
 *
 * "Strong Buy" (TV's proprietary `Recommend.All`) is intentionally absent
 * — it depends on a 26-indicator composite that isn't available for
 * historical dates.
 */
import type { IndicatorSeries } from "./historical-indicators";

export type BacktestStrategy = "oversold" | "breakout" | "macd_cross";

export const STRATEGY_LABELS: Record<BacktestStrategy, string> = {
  oversold: "Oversold (RSI < 30)",
  breakout: "Momentum Breakout",
  macd_cross: "MACD Bullish Cross",
};

export interface ScanCandidate {
  symbol: string;
  score: number;
  // Surface the indicators that drove the pick so the UI can show
  // "why this one" without recomputing.
  close: number;
  rsi: number | null;
  macdSpread: number | null;
  changePct: number | null;
}

export interface DayScan {
  oversold: ScanCandidate[];
  breakout: ScanCandidate[];
  macd_cross: ScanCandidate[];
}

/**
 * Score the universe for a single date. Candidates within each bucket are
 * sorted by score descending; pass `limit` to cap the output (defaults
 * unbounded so callers can take .slice() as needed).
 */
export function scanAt(
  date: string,
  seriesBySymbol: Record<string, IndicatorSeries>,
  limit: number = 50,
): DayScan {
  const out: DayScan = { oversold: [], breakout: [], macd_cross: [] };

  for (const [symbol, series] of Object.entries(seriesBySymbol)) {
    const i = series.dates.indexOf(date);
    if (i === -1) continue;

    const close = series.closes[i];
    const rsi = series.rsi14[i];
    const ema20 = series.ema20[i];
    const sma50 = series.sma50[i];
    const sma200 = series.sma200[i];
    const macd = series.macd[i];
    const sig = series.macdSignal[i];
    const chg = series.changePct[i];
    const volR = series.volRatio[i];
    const macdSpread = macd !== null && sig !== null ? macd - sig : null;

    const base: Omit<ScanCandidate, "score"> = {
      symbol,
      close,
      rsi,
      macdSpread,
      changePct: chg,
    };

    if (rsi !== null && rsi < 30) {
      out.oversold.push({ ...base, score: 30 - rsi });
    }

    if (
      ema20 !== null &&
      sma50 !== null &&
      sma200 !== null &&
      close > ema20 &&
      ema20 > sma50 &&
      sma50 > sma200 &&
      (chg ?? 0) > 0
    ) {
      const trend = close / sma200;
      const score = trend * (volR ?? 1);
      out.breakout.push({ ...base, score });
    }

    if (macd !== null && sig !== null && macd > sig) {
      out.macd_cross.push({ ...base, score: macd - sig });
    }
  }

  for (const k of Object.keys(out) as BacktestStrategy[]) {
    out[k].sort((a, b) => b.score - a.score);
    out[k] = out[k].slice(0, limit);
  }
  return out;
}
