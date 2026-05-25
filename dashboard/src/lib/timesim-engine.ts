import type {
  Position,
  Simulation,
  SimSummary,
} from "./types-sim";
import { reconcile } from "./sim-engine";

/**
 * For time simulations the "current" price of a position is the close on the
 * as-of date the user picked. We look up the close ≤ asOfDate per symbol;
 * if no close exists on that exact day (weekend / holiday), we walk back to
 * the most recent prior trading day.
 */
export function closeOnOrBefore(
  closes: Record<string, number> | undefined,
  date: string,
): number | null {
  if (!closes) return null;
  // Fast path: exact match
  if (typeof closes[date] === "number") return closes[date];
  const days = Object.keys(closes).sort();
  let best: string | null = null;
  for (const d of days) {
    if (d <= date) best = d;
    else break;
  }
  return best ? closes[best] : null;
}

/**
 * Like `valuation` from sim-engine, but values open positions using historical
 * closes as of a specific date. Trades AFTER `asOfDate` are excluded.
 */
export function valuationAsOf(
  sim: Simulation,
  closesBySymbol: Record<string, Record<string, number>>,
  asOfDate: string,
): SimSummary & { positions: Position[]; asOfDate: string } {
  const eod = new Date(asOfDate + "T23:59:59.999Z");
  const { cash, positions, realizedPnl } = reconcile(sim, eod);

  let positionsValue = 0;
  for (const p of positions) {
    const px = closeOnOrBefore(closesBySymbol[p.symbol], asOfDate);
    if (typeof px === "number") {
      p.currentPrice = px;
      p.marketValue = px * p.shares;
      p.unrealizedPnl = p.marketValue - p.costBasis;
      p.unrealizedPnlPct =
        p.costBasis > 0 ? (p.unrealizedPnl / p.costBasis) * 100 : 0;
      // Day change: close[asOf] vs close[asOf-1 trading day]
      const closes = closesBySymbol[p.symbol] ?? {};
      const days = Object.keys(closes).sort();
      const idx = days.findIndex((d) => d === asOfDate);
      let prev: number | null = null;
      if (idx > 0) prev = closes[days[idx - 1]];
      else {
        // closest prior
        for (let i = days.length - 1; i >= 0; i--) {
          if (days[i] < asOfDate) {
            prev = closes[days[i]];
            break;
          }
        }
      }
      p.dayChangePct =
        prev && prev > 0 ? ((px - prev) / prev) * 100 : null;
      positionsValue += p.marketValue;
    } else {
      p.currentPrice = null;
      p.marketValue = 0;
      p.unrealizedPnl = 0;
      p.unrealizedPnlPct = 0;
      p.dayChangePct = null;
    }
  }

  const unrealizedPnl = positions.reduce(
    (sum, p) => sum + (p.unrealizedPnl ?? 0),
    0,
  );
  const totalValue = cash + positionsValue;
  const totalPnl = totalValue - sim.startingCash;
  const totalPnlPct = (totalPnl / sim.startingCash) * 100;

  // Count only trades that happened on or before the as-of date
  const tradesAsOf = sim.trades.filter(
    (t) => new Date(t.timestamp) <= eod,
  );

  return {
    id: sim.id,
    name: sim.name,
    description: sim.description,
    startingCash: sim.startingCash,
    commissionPerTrade: sim.commissionPerTrade,
    slippageBps: sim.slippageBps,
    createdAt: sim.createdAt,
    cash,
    positionsValue,
    totalValue,
    totalPnl,
    totalPnlPct,
    realizedPnl,
    unrealizedPnl,
    numTrades: tradesAsOf.length,
    numOpenPositions: positions.length,
    positions,
    asOfDate,
  };
}

/**
 * Yahoo range to request, based on how far back the first trade is.
 */
export function rangeForSpan(firstTradeDate: string, asOfDate: string): string {
  const start = +new Date(firstTradeDate);
  const end = +new Date(asOfDate);
  const days = (end - start) / (1000 * 60 * 60 * 24);
  if (days <= 30) return "3mo"; // a little buffer for trailing close
  if (days <= 90) return "6mo";
  if (days <= 180) return "1y";
  if (days <= 365) return "2y";
  if (days <= 730) return "5y";
  return "10y";
}
