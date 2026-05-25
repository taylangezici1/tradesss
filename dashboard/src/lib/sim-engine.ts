import type {
  EquityCurve,
  EquityPoint,
  Position,
  Simulation,
  SimSummary,
} from "./types-sim";

/**
 * Replays trades to compute net cash, positions, and realized P/L.
 * Uses weighted-average cost basis (resets when net shares hits zero).
 *
 * Returns the snapshot at a given timestamp (defaults to "include all trades").
 */
export function reconcile(
  sim: Simulation,
  asOf?: Date,
): {
  cash: number;
  positions: Position[];
  realizedPnl: number;
} {
  let cash = sim.startingCash;
  let realized = 0;

  // Track lots by symbol with FIFO weighted-average cost
  const lots = new Map<
    string,
    {
      symbol: string;
      tvTicker: string;
      shares: number;
      costBasis: number;
      realized: number;
    }
  >();

  const trades = [...sim.trades].sort(
    (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
  );

  for (const t of trades) {
    if (asOf && new Date(t.timestamp) > asOf) break;

    const sym = t.symbol.toUpperCase();
    const lot = lots.get(sym) ?? {
      symbol: sym,
      tvTicker: t.tvTicker,
      shares: 0,
      costBasis: 0,
      realized: 0,
    };

    const gross = t.price * t.shares;

    if (t.side === "BUY") {
      cash -= gross + t.commission;
      lot.shares += t.shares;
      lot.costBasis += gross;
      lot.tvTicker = t.tvTicker; // keep up to date
    } else {
      // SELL
      cash += gross - t.commission;
      const avg = lot.shares > 0 ? lot.costBasis / lot.shares : 0;
      const proceeds = gross;
      const costOfSold = avg * t.shares;
      const gain = proceeds - costOfSold - t.commission;
      lot.realized += gain;
      realized += gain;
      lot.shares -= t.shares;
      lot.costBasis -= costOfSold;
      // floor to zero to handle tiny floating drift after a full close
      if (Math.abs(lot.shares) < 1e-9) {
        lot.shares = 0;
        lot.costBasis = 0;
      }
    }
    lots.set(sym, lot);
  }

  const positions: Position[] = Array.from(lots.values())
    .filter((l) => l.shares > 0)
    .map((l) => ({
      symbol: l.symbol,
      tvTicker: l.tvTicker,
      shares: l.shares,
      avgCost: l.shares > 0 ? l.costBasis / l.shares : 0,
      costBasis: l.costBasis,
      realizedPnl: l.realized,
    }));

  return { cash, positions, realizedPnl: realized };
}

export interface PriceMap {
  // symbol -> {currentPrice, dayChangePct}
  [symbol: string]: { price: number; dayChangePct?: number | null };
}

export function valuation(
  sim: Simulation,
  prices: PriceMap,
): SimSummary & { positions: Position[] } {
  const { cash, positions, realizedPnl } = reconcile(sim);

  let positionsValue = 0;
  for (const p of positions) {
    const px = prices[p.symbol]?.price;
    const dayChange = prices[p.symbol]?.dayChangePct ?? null;
    if (typeof px === "number") {
      p.currentPrice = px;
      p.marketValue = px * p.shares;
      p.unrealizedPnl = p.marketValue - p.costBasis;
      p.unrealizedPnlPct =
        p.costBasis > 0 ? (p.unrealizedPnl / p.costBasis) * 100 : 0;
      p.dayChangePct = dayChange;
      positionsValue += p.marketValue;
    } else {
      p.currentPrice = null;
      p.marketValue = 0;
      p.unrealizedPnl = 0;
      p.unrealizedPnlPct = 0;
      p.dayChangePct = dayChange;
    }
  }

  const unrealizedPnl = positions.reduce(
    (sum, p) => sum + (p.unrealizedPnl ?? 0),
    0,
  );
  const totalValue = cash + positionsValue;
  const totalPnl = totalValue - sim.startingCash;
  const totalPnlPct = (totalPnl / sim.startingCash) * 100;

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
    numTrades: sim.trades.length,
    numOpenPositions: positions.length,
    positions,
  };
}

/**
 * Compute daily equity curve given historical closes per symbol.
 *
 * @param sim simulation
 * @param historicalCloses symbol -> Map<date(YYYY-MM-DD), close>
 * @param days dates to include (inclusive, sorted asc)
 */
export function equityCurve(
  sim: Simulation,
  historicalCloses: Record<string, Record<string, number>>,
  days: string[],
): EquityCurve {
  const points: EquityPoint[] = [];

  for (const day of days) {
    // EOD timestamp of this day for trade inclusion (trades made on the same
    // day count toward that day's EOD value)
    const eod = new Date(day + "T23:59:59.999Z");
    const snap = reconcile(sim, eod);

    let positionsValue = 0;
    for (const p of snap.positions) {
      const close = historicalCloses[p.symbol]?.[day];
      if (typeof close === "number") {
        positionsValue += close * p.shares;
      } else {
        // Fallback: cost basis (better than zero, surfaces missing data)
        positionsValue += p.costBasis;
      }
    }
    points.push({
      date: day,
      value: snap.cash + positionsValue,
      cash: snap.cash,
      positionsValue,
    });
  }

  const startingValue = sim.startingCash;
  const endingValue = points.length
    ? points[points.length - 1].value
    : startingValue;

  // Max drawdown
  let peak = startingValue;
  let mdd = 0;
  for (const p of points) {
    if (p.value > peak) peak = p.value;
    const dd = ((p.value - peak) / peak) * 100;
    if (dd < mdd) mdd = dd;
  }

  return {
    points,
    startingValue,
    endingValue,
    totalReturn: endingValue - startingValue,
    totalReturnPct: ((endingValue - startingValue) / startingValue) * 100,
    maxDrawdownPct: mdd,
  };
}

/**
 * Validates a buy: enforces sim.maxPositionPct if set.
 * Returns null if ok, else an error string.
 */
export function validateBuy(
  sim: Simulation,
  symbol: string,
  shares: number,
  price: number,
  currentTotalValue: number,
): string | null {
  if (shares <= 0) return "Shares must be > 0";
  if (price <= 0) return "Price must be > 0";

  const tradeCost = shares * price;

  if (sim.maxPositionPct && sim.maxPositionPct > 0) {
    // Combine with existing position in this symbol
    const { positions } = reconcile(sim);
    const existing = positions.find(
      (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
    );
    const existingValue = existing ? existing.shares * price : 0;
    const proposedValue = existingValue + tradeCost;
    const limit = (sim.maxPositionPct / 100) * currentTotalValue;
    if (proposedValue > limit) {
      return `Position size rule: ${symbol} would be $${proposedValue.toFixed(
        0,
      )}, exceeds ${sim.maxPositionPct}% cap of $${limit.toFixed(0)}.`;
    }
  }
  return null;
}

export function applySlippage(
  price: number,
  side: "BUY" | "SELL",
  slippageBps: number,
): number {
  if (!slippageBps) return price;
  const factor = slippageBps / 10_000;
  return side === "BUY" ? price * (1 + factor) : price * (1 - factor);
}

