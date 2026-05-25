import type { ScanResult, StockRow, StrategyKey } from "./types";

const enrich = (s: StockRow): StockRow => {
  const close = s.close;
  const ema20 = s.ema20;

  if (close && ema20) {
    s.emaGapPct = ((close - ema20) / ema20) * 100;
  }
  if (s.volume && s.avgVolume10d) {
    s.volRatio = s.volume / s.avgVolume10d;
  }
  if (close && s.low52w) {
    s.pctFrom52wLow = ((close - s.low52w) / s.low52w) * 100;
  }
  if (close && s.high52w) {
    s.pctFrom52wHigh = ((close - s.high52w) / s.high52w) * 100;
  }
  if (s.macd !== null && s.macdSignal !== null) {
    s.macdSpread = s.macd - s.macdSignal;
  }
  return s;
};

export function classify(stocks: StockRow[]): ScanResult["strategies"] {
  const out: ScanResult["strategies"] = {
    strong_buy: [],
    oversold: [],
    breakout: [],
    macd_cross: [],
  };

  for (const raw of stocks) {
    const s = enrich({ ...raw });

    if (s.ratingAll !== null && s.ratingAll >= 0.5) {
      out.strong_buy.push({ ...s, score: s.ratingAll });
    }

    if (s.rsi !== null && s.rsi < 30) {
      out.oversold.push({ ...s, score: 30 - s.rsi });
    }

    if (
      s.close !== null &&
      s.ema20 !== null &&
      s.sma50 !== null &&
      s.sma200 !== null &&
      s.close > s.ema20 &&
      s.ema20 > s.sma50 &&
      s.sma50 > s.sma200 &&
      (s.change ?? 0) > 0
    ) {
      const trend = s.close / s.sma200;
      const score = trend * (s.volRatio ?? 1);
      out.breakout.push({ ...s, score });
    }

    if (
      s.macd !== null &&
      s.macdSignal !== null &&
      s.macd > s.macdSignal
    ) {
      out.macd_cross.push({ ...s, score: s.macd - s.macdSignal });
    }
  }

  for (const key of Object.keys(out) as StrategyKey[]) {
    out[key].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    out[key] = out[key].slice(0, 50);
  }
  return out;
}
