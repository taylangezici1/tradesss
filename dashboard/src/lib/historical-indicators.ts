/**
 * Pure technical-indicator math, computed from a sorted array of daily
 * closes. Used by the auto-rules backtest engine to reconstruct scanner
 * signals at any historical date without relying on TradingView.
 *
 * All functions return arrays the same length as `closes`, padded with
 * `null` at positions where there isn't enough history to compute a value.
 */

export interface BarSeries {
  dates: string[];   // YYYY-MM-DD, sorted ascending
  closes: number[];  // aligned to dates
  volumes: number[]; // aligned to dates (0 when missing)
}

/* ---------------------------- moving averages ---------------------------- */

export function sma(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (n <= 0 || closes.length < n) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += closes[i];
  out[n - 1] = sum / n;
  for (let i = n; i < closes.length; i++) {
    sum += closes[i] - closes[i - n];
    out[i] = sum / n;
  }
  return out;
}

export function ema(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (n <= 0 || closes.length < n) return out;
  const k = 2 / (n + 1);
  // Seed with SMA of first n closes
  let seed = 0;
  for (let i = 0; i < n; i++) seed += closes[i];
  let prev = seed / n;
  out[n - 1] = prev;
  for (let i = n; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/* ----------------------------------- RSI --------------------------------- */
/**
 * Wilder's RSI (the canonical formula): smoothed average gain / loss over n
 * periods. Returns values 0-100 at indices >= n; `null` before that.
 */
export function rsi(closes: number[], n: number = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < n + 1) return out;

  // Seed: simple average of first n gains/losses
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }
  let avgGain = gainSum / n;
  let avgLoss = lossSum / n;
  out[n] = compute(avgGain, avgLoss);

  for (let i = n + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (n - 1) + gain) / n;
    avgLoss = (avgLoss * (n - 1) + loss) / n;
    out[i] = compute(avgGain, avgLoss);
  }
  return out;

  function compute(g: number, l: number): number {
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  }
}

/* ----------------------------------- MACD -------------------------------- */
/**
 * Standard MACD(12, 26, 9). Returns aligned arrays:
 *   macd[i]   = EMA12 - EMA26  (or null if not enough history)
 *   signal[i] = EMA9 of macd   (or null)
 */
export function macd(
  closes: number[],
  fast: number = 12,
  slow: number = 26,
  signalPeriod: number = 9,
): { macd: (number | null)[]; signal: (number | null)[] } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  // Signal = EMA9 of macdLine, but only over the indices where macd is defined.
  // We compute EMA on the contiguous-from-start subarray and pad with nulls.
  const firstDefined = macdLine.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  if (firstDefined === -1) return { macd: macdLine, signal };

  const sub: number[] = macdLine
    .slice(firstDefined)
    .map((v) => (v as number));
  const subEma = ema(sub, signalPeriod);
  for (let i = 0; i < subEma.length; i++) {
    signal[firstDefined + i] = subEma[i];
  }
  return { macd: macdLine, signal };
}

/* ---------------------------- volume ratio ------------------------------- */
/**
 * volRatio[i] = volume[i] / avg(volume[i-window+1 .. i])
 * `null` until we have `window` prior bars.
 */
export function volRatio(
  volumes: number[],
  window: number = 10,
): (number | null)[] {
  const out: (number | null)[] = new Array(volumes.length).fill(null);
  if (volumes.length < window) return out;
  let sum = 0;
  for (let i = 0; i < window; i++) sum += volumes[i];
  out[window - 1] = volumes[window - 1] / (sum / window || 1);
  for (let i = window; i < volumes.length; i++) {
    sum += volumes[i] - volumes[i - window];
    const avg = sum / window;
    out[i] = avg > 0 ? volumes[i] / avg : null;
  }
  return out;
}

/* --------------------------- daily % change ------------------------------ */
export function changePct(closes: number[]): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) out[i] = ((closes[i] - prev) / prev) * 100;
  }
  return out;
}

/* -------------------- per-day snapshot of indicators --------------------- */

export interface IndicatorSeries {
  dates: string[];
  closes: number[];
  rsi14: (number | null)[];
  ema20: (number | null)[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  macd: (number | null)[];
  macdSignal: (number | null)[];
  changePct: (number | null)[];
  volRatio: (number | null)[];
}

export function computeAll(bars: BarSeries): IndicatorSeries {
  const { macd: macdLine, signal } = macd(bars.closes);
  return {
    dates: bars.dates,
    closes: bars.closes,
    rsi14: rsi(bars.closes, 14),
    ema20: ema(bars.closes, 20),
    sma50: sma(bars.closes, 50),
    sma200: sma(bars.closes, 200),
    macd: macdLine,
    macdSignal: signal,
    changePct: changePct(bars.closes),
    volRatio: volRatio(bars.volumes, 10),
  };
}

/**
 * Pull the indicator snapshot for a specific date. Returns null if the
 * date is missing (weekend/holiday) or beyond the available range.
 */
export interface IndicatorSnapshot {
  date: string;
  close: number;
  rsi14: number | null;
  ema20: number | null;
  sma50: number | null;
  sma200: number | null;
  macd: number | null;
  macdSignal: number | null;
  changePct: number | null;
  volRatio: number | null;
}

export function snapshotOn(
  series: IndicatorSeries,
  date: string,
): IndicatorSnapshot | null {
  const i = series.dates.indexOf(date);
  if (i === -1) return null;
  return {
    date,
    close: series.closes[i],
    rsi14: series.rsi14[i],
    ema20: series.ema20[i],
    sma50: series.sma50[i],
    sma200: series.sma200[i],
    macd: series.macd[i],
    macdSignal: series.macdSignal[i],
    changePct: series.changePct[i],
    volRatio: series.volRatio[i],
  };
}
