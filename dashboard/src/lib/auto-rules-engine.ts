/**
 * Auto-rules backtest engine.
 *
 * Walks trading days from `startDate` to `endDate`, evaluating the
 * configured stop-loss / take-profit triggers on the in-scope positions
 * and reinvesting freed cash into the top scanner pick from the chosen
 * strategy. Pure-ish: takes pre-fetched indicator series + manual trades
 * in, returns the synthetic trades it generated plus a per-day snapshot
 * series the UI can scrub through.
 */
import type { AutoRules, Position, Simulation, Trade } from "./types-sim";
import { applySlippage, reconcile } from "./sim-engine";
import {
  computeAll,
  type BarSeries,
  type IndicatorSeries,
} from "./historical-indicators";
import {
  scanAt,
  type DayScan,
  type ScanCandidate,
} from "./historical-scanner";
import { tvTickerFor } from "./sp500";

export const AUTO_NOTE_PREFIX = "AUTO:";

/* -------------------------------- types --------------------------------- */

export interface RawBars {
  closes: Record<string, number>;  // date -> close
  volumes: Record<string, number>; // date -> volume
}

export interface DailySnapshot {
  date: string;
  cash: number;
  positions: PositionSnapshot[];
  value: number;
  tradesToday: Trade[];
  scannerTop3: ScanCandidate[];
}

export interface PositionSnapshot {
  symbol: string;
  shares: number;
  avgCost: number;
  costBasis: number;
  close: number | null;
  marketValue: number;
  unrealizedPnlPct: number;
  isAutoBought: boolean;
}

export interface AutoRulesRunResult {
  trades: Trade[];          // sim.trades after the run (manual + auto)
  generatedTrades: Trade[]; // only the new auto-trades
  dailySnapshots: DailySnapshot[];
}

/* ----------------------------- helpers ---------------------------------- */

function isAutoTrade(t: Trade): boolean {
  return (t.note ?? "").startsWith(AUTO_NOTE_PREFIX);
}

function tradingDaysInRange(
  start: string,
  end: string,
  anySeries: IndicatorSeries[],
): string[] {
  // Union of dates across all symbol series (only includes real trading
  // days). Bounded to [start, end].
  const dates = new Set<string>();
  for (const s of anySeries) {
    for (const d of s.dates) {
      if (d >= start && d <= end) dates.add(d);
    }
  }
  return Array.from(dates).sort();
}

function makeAutoTradeId(): string {
  return (
    "a-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

function findAutoBoughtSymbols(trades: Trade[]): Set<string> {
  const out = new Set<string>();
  for (const t of trades) {
    if (t.side === "BUY" && isAutoTrade(t)) out.add(t.symbol.toUpperCase());
  }
  return out;
}

/* ------------------------------ engine ---------------------------------- */

export function runAutoRules(args: {
  sim: Simulation;
  rules: AutoRules;
  barsBySymbol: Record<string, RawBars>;
  startDate: string;
  endDate: string;
}): AutoRulesRunResult {
  const { sim, rules, barsBySymbol, startDate, endDate } = args;

  // 1. Strip prior auto-trades so re-runs are idempotent. Manual trades are
  //    preserved untouched.
  const manualOnly = sim.trades.filter((t) => !isAutoTrade(t));

  // 2. Compute indicator series for every universe symbol once.
  const seriesBySymbol: Record<string, IndicatorSeries> = {};
  for (const [sym, bars] of Object.entries(barsBySymbol)) {
    const dates = Object.keys(bars.closes).sort();
    if (dates.length === 0) continue;
    const series: BarSeries = {
      dates,
      closes: dates.map((d) => bars.closes[d]),
      volumes: dates.map((d) => bars.volumes[d] ?? 0),
    };
    seriesBySymbol[sym.toUpperCase()] = computeAll(series);
  }

  // 3. Working sim object we mutate as the engine fires trades.
  const working: Simulation = { ...sim, trades: [...manualOnly] };
  const generated: Trade[] = [];
  const snapshots: DailySnapshot[] = [];

  const allSeries = Object.values(seriesBySymbol);

  for (const day of tradingDaysInRange(startDate, endDate, allSeries)) {
    const tradesTodayStart = working.trades.length;

    // Reconcile up to end-of-day BEFORE today's auto-trades (so we see what
    // positions exist as the rules begin evaluating).
    const eod = new Date(day + "T23:59:59.999Z");
    const reconciledPre = reconcile(working, eod);
    const autoBoughtSyms = findAutoBoughtSymbols(working.trades);

    /* ----------------------- evaluate SL / TP ----------------------- */
    const sellsToFire: Array<{ pos: Position; reason: string }> = [];

    for (const pos of reconciledPre.positions) {
      const inScope =
        rules.ruleScope === "all" ||
        (rules.ruleScope === "auto_only" &&
          autoBoughtSyms.has(pos.symbol.toUpperCase()));
      if (!inScope) continue;

      const todayClose = closeOn(barsBySymbol[pos.symbol.toUpperCase()], day);
      if (todayClose === null || pos.avgCost <= 0) continue;

      const pnlPct = ((todayClose - pos.avgCost) / pos.avgCost) * 100;
      if (pnlPct <= -Math.abs(rules.stopLossPct)) {
        sellsToFire.push({
          pos,
          reason: `SL ${rules.stopLossPct.toFixed(1)}%`,
        });
      } else if (pnlPct >= Math.abs(rules.takeProfitPct)) {
        sellsToFire.push({
          pos,
          reason: `TP +${rules.takeProfitPct.toFixed(1)}%`,
        });
      }
    }

    /* ----------------------- fire SELLs at close ---------------------- */
    let freedCash = 0;
    for (const { pos, reason } of sellsToFire) {
      const todayClose = closeOn(barsBySymbol[pos.symbol.toUpperCase()], day);
      if (todayClose === null) continue;
      const execPrice = applySlippage(todayClose, "SELL", working.slippageBps);
      const commission = working.commissionPerTrade || 0;
      const proceeds = execPrice * pos.shares - commission;
      freedCash += proceeds;
      const trade: Trade = {
        id: makeAutoTradeId(),
        symbol: pos.symbol,
        tvTicker: pos.tvTicker,
        side: "SELL",
        shares: pos.shares,
        price: execPrice,
        commission,
        slippage: Math.abs(execPrice - todayClose) * pos.shares,
        timestamp: new Date(day + "T20:00:00.000Z").toISOString(),
        note: `${AUTO_NOTE_PREFIX} ${reason}`,
      };
      working.trades.push(trade);
      generated.push(trade);
    }

    /* ----------------------- reinvest into top pick ------------------- */
    let scan: DayScan | null = null;
    let buyCandidate: ScanCandidate | null = null;
    let buyTrade: Trade | null = null;
    let scannerTop3: ScanCandidate[] = [];

    // Post-sell positions = pre-day positions minus what we just sold.
    const heldNow = new Set(
      reconciledPre.positions
        .filter(
          (p) =>
            !sellsToFire.some(
              (s) => s.pos.symbol.toUpperCase() === p.symbol.toUpperCase(),
            ),
        )
        .map((p) => p.symbol.toUpperCase()),
    );

    // Deploy when we just freed cash via a sell, OR when the portfolio has
    // emptied out and idle cash is sitting around. Otherwise the engine
    // would go dormant after a full exit and the rotation thesis would
    // stall.
    const idleCashAfterFullExit =
      heldNow.size === 0 ? reconciledPre.cash : 0;
    const cashForBuy = freedCash + idleCashAfterFullExit;

    if (cashForBuy > 0) {
      scan = scanAt(day, seriesBySymbol, 50);
      const bucket = scan[rules.reinvestStrategy];
      scannerTop3 = bucket.slice(0, 3);

      if (bucket.length > 0) {
        // Resolve which candidate to actually buy per the rules.
        for (const cand of bucket) {
          const sym = cand.symbol.toUpperCase();
          if (!heldNow.has(sym)) {
            buyCandidate = cand;
            break;
          }
          // Held — branch on duplicateHandling
          if (rules.duplicateHandling === "pyramid") {
            buyCandidate = cand;
            break;
          }
          if (rules.duplicateHandling === "hold_cash") {
            buyCandidate = null;
            break;
          }
          // skip_to_next → continue loop
        }
      } else if (rules.noMatchBehavior === "relax_threshold") {
        // Bucket empty + user asked for relaxed fallback: pick the
        // lowest-RSI / strongest-MACD / best-trend name even if it
        // doesn't clear the bucket threshold.
        const fallback = relaxedPick(
          rules.reinvestStrategy,
          seriesBySymbol,
          day,
        );
        if (fallback) {
          scannerTop3 = [fallback];
          buyCandidate = fallback;
        }
      }

      if (buyCandidate && cashForBuy > 0) {
        const closeToday = buyCandidate.close;
        const execPrice = applySlippage(closeToday, "BUY", working.slippageBps);
        const commission = working.commissionPerTrade || 0;
        const maxSpend = cashForBuy - commission;
        if (maxSpend > 0 && execPrice > 0) {
          const shares = maxSpend / execPrice;
          buyTrade = {
            id: makeAutoTradeId(),
            symbol: buyCandidate.symbol,
            tvTicker:
              tvTickerFor(buyCandidate.symbol) ??
              `NASDAQ:${buyCandidate.symbol}`,
            side: "BUY",
            shares,
            price: execPrice,
            commission,
            slippage: Math.abs(execPrice - closeToday) * shares,
            timestamp: new Date(day + "T20:01:00.000Z").toISOString(),
            note: buyNote(rules.reinvestStrategy, buyCandidate),
          };
          working.trades.push(buyTrade);
          generated.push(buyTrade);
        }
      }
    }

    /* --------------------------- snapshot ----------------------------- */
    const reconciledPost = reconcile(
      working,
      new Date(day + "T23:59:59.999Z"),
    );
    const positionSnaps: PositionSnapshot[] = reconciledPost.positions.map(
      (p) => {
        const c = closeOn(barsBySymbol[p.symbol.toUpperCase()], day);
        const marketValue = c !== null ? c * p.shares : p.costBasis;
        const upnlPct =
          c !== null && p.avgCost > 0
            ? ((c - p.avgCost) / p.avgCost) * 100
            : 0;
        return {
          symbol: p.symbol,
          shares: p.shares,
          avgCost: p.avgCost,
          costBasis: p.costBasis,
          close: c,
          marketValue,
          unrealizedPnlPct: upnlPct,
          isAutoBought: findAutoBoughtSymbols(working.trades).has(
            p.symbol.toUpperCase(),
          ),
        };
      },
    );
    const totalValue =
      reconciledPost.cash + positionSnaps.reduce((s, p) => s + p.marketValue, 0);

    snapshots.push({
      date: day,
      cash: reconciledPost.cash,
      positions: positionSnaps,
      value: totalValue,
      tradesToday: working.trades.slice(tradesTodayStart),
      scannerTop3,
    });
  }

  return {
    trades: working.trades,
    generatedTrades: generated,
    dailySnapshots: snapshots,
  };
}

function closeOn(bars: RawBars | undefined, date: string): number | null {
  if (!bars) return null;
  const c = bars.closes[date];
  return typeof c === "number" ? c : null;
}

function buyNote(strat: AutoRules["reinvestStrategy"], cand: ScanCandidate): string {
  const stratLabel =
    strat === "oversold" ? "oversold" : strat === "breakout" ? "breakout" : "MACD cross";
  const detail =
    strat === "oversold" && cand.rsi !== null
      ? ` (RSI ${cand.rsi.toFixed(1)})`
      : strat === "macd_cross" && cand.macdSpread !== null
        ? ` (MACD spread ${cand.macdSpread.toFixed(2)})`
        : "";
  return `${AUTO_NOTE_PREFIX} top ${stratLabel}${detail}`;
}

/**
 * Relaxed fallback pick: ignores the bucket's threshold and just returns
 * the most attractive single name under the chosen strategy's spirit.
 *   - oversold: lowest RSI
 *   - macd_cross: largest MACD spread (positive or negative)
 *   - breakout: best (close/sma200 × volRatio) regardless of trend stack
 */
function relaxedPick(
  strat: AutoRules["reinvestStrategy"],
  seriesBySymbol: Record<string, IndicatorSeries>,
  date: string,
): ScanCandidate | null {
  let best: ScanCandidate | null = null;
  let bestScore = -Infinity;
  for (const [sym, s] of Object.entries(seriesBySymbol)) {
    const i = s.dates.indexOf(date);
    if (i === -1) continue;
    const close = s.closes[i];
    const rsi = s.rsi14[i];
    const macd = s.macd[i];
    const sig = s.macdSignal[i];
    const sma200 = s.sma200[i];
    const volR = s.volRatio[i];
    let score: number | null = null;
    if (strat === "oversold" && rsi !== null) score = 100 - rsi;
    else if (strat === "macd_cross" && macd !== null && sig !== null)
      score = macd - sig;
    else if (strat === "breakout" && sma200 !== null && sma200 > 0)
      score = (close / sma200) * (volR ?? 1);
    if (score !== null && score > bestScore) {
      bestScore = score;
      const macdSpread = macd !== null && sig !== null ? macd - sig : null;
      best = {
        symbol: sym,
        score,
        close,
        rsi,
        macdSpread,
        changePct: s.changePct[i],
      };
    }
  }
  return best;
}
