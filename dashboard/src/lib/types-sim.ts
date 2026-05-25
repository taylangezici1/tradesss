export type Side = "BUY" | "SELL";

/**
 * Configuration for the auto-trading engine attached to a time simulation.
 * When present, the user can run a day-by-day backtest that sells positions
 * hitting the stop-loss or take-profit threshold and reinvests freed cash
 * into the top scanner pick from the chosen strategy.
 */
export interface AutoRules {
  /** Sell when a position falls this % from its average cost. */
  stopLossPct: number;
  /** Sell when a position rises this % from its average cost. */
  takeProfitPct: number;
  /** Which positions the SL/TP triggers apply to. */
  ruleScope: "all" | "auto_only";
  /** Bucket whose top-ranked candidate gets the freed cash. */
  reinvestStrategy: "oversold" | "breakout" | "macd_cross";
  /** What to do when the top pick is already in the portfolio. */
  duplicateHandling: "skip_to_next" | "pyramid" | "hold_cash";
  /** What to do when no candidate matches the strategy on a given day. */
  noMatchBehavior: "hold_cash" | "relax_threshold";
  /** Candidate universe. v1 only supports the static S&P 500 list. */
  universe: "sp500";
}

export interface Trade {
  id: string;
  symbol: string;          // e.g. "AAPL"
  tvTicker: string;        // e.g. "NASDAQ:AAPL"
  side: Side;
  shares: number;
  price: number;           // execution price per share, AFTER slippage
  commission: number;      // dollars
  slippage: number;        // dollars (info only — already baked into price)
  timestamp: string;       // ISO
  note?: string;
}

export interface Simulation {
  id: string;
  name: string;
  description?: string;
  startingCash: number;
  commissionPerTrade: number;   // dollars per trade, fixed
  slippageBps: number;          // basis points (100 bps = 1%)
  maxPositionPct?: number;      // e.g. 5 means each position max 5% of portfolio value at buy time
  createdAt: string;
  /**
   * For time-aware simulations only: the "scenario start" date (YYYY-MM-DD).
   * This is when the user notionally began trading in the scenario — the
   * default trade date for the add-trade modal and the lower bound for the
   * as-of date slider. Distinct from `createdAt` (which is when the record
   * was created in the DB).
   */
  startDate?: string;
  /** Auto-trading rule configuration (time simulations only). */
  autoRules?: AutoRules;
  trades: Trade[];
}

export interface Position {
  symbol: string;
  tvTicker: string;
  shares: number;             // net shares held
  avgCost: number;            // average cost per share (only for the currently-held lot)
  costBasis: number;          // shares * avgCost
  realizedPnl: number;        // realized P/L for closed shares of this symbol
  currentPrice?: number | null;
  marketValue?: number;       // shares * currentPrice
  unrealizedPnl?: number;     // marketValue - costBasis
  unrealizedPnlPct?: number;
  dayChangePct?: number | null;
}

export interface SimSummary {
  id: string;
  name: string;
  description?: string;
  startingCash: number;
  commissionPerTrade: number;
  slippageBps: number;
  createdAt: string;
  cash: number;
  positionsValue: number;     // total market value of all positions (current)
  totalValue: number;         // cash + positionsValue
  totalPnl: number;           // totalValue - startingCash
  totalPnlPct: number;
  realizedPnl: number;
  unrealizedPnl: number;
  numTrades: number;
  numOpenPositions: number;
}

export interface SimDetail extends SimSummary {
  config: {
    commissionPerTrade: number;
    slippageBps: number;
    maxPositionPct?: number;
  };
  positions: Position[];
  trades: Trade[];
}

export interface EquityPoint {
  date: string;       // YYYY-MM-DD
  value: number;      // total portfolio value that day
  cash: number;
  positionsValue: number;
}

export interface EquityCurve {
  points: EquityPoint[];
  startingValue: number;
  endingValue: number;
  totalReturn: number;       // absolute $
  totalReturnPct: number;
  maxDrawdownPct: number;
}
