export type GlossaryTerm =
  | "price"
  | "day_change"
  | "rsi"
  | "macd"
  | "macd_signal"
  | "macd_spread"
  | "tv_rating"
  | "tv_rating_ma"
  | "tv_rating_osc"
  | "stoch_k"
  | "adx"
  | "ema20"
  | "ema50"
  | "sma50"
  | "sma200"
  | "bb_upper"
  | "bb_lower"
  | "market_cap"
  | "pe"
  | "volume"
  | "avg_volume_10d"
  | "vol_ratio"
  | "ema_gap"
  | "high52w"
  | "low52w"
  | "pct_from_low52w"
  | "pct_from_high52w"
  | "avg_cost"
  | "cost_basis"
  | "market_value"
  | "unrealized_pnl"
  | "realized_pnl"
  | "total_value"
  | "starting_cash"
  | "max_drawdown"
  | "commission"
  | "slippage_bps"
  | "max_position_pct"
  | "shares"
  | "conviction_score"
  | "strategy_strong_buy"
  | "strategy_oversold"
  | "strategy_breakout"
  | "strategy_macd_cross"
  | "strategy_signals";

export interface Definition {
  title: string;
  definition: string;
}

export const GLOSSARY: Record<GlossaryTerm, Definition> = {
  price: {
    title: "Price",
    definition:
      "Most recent traded price per share in USD. Refreshes server-side from TradingView; rendered with up to 5-minute cache.",
  },
  day_change: {
    title: "Day %",
    definition:
      "Percent change from yesterday's close to the current price. Green = up, red = down.",
  },
  rsi: {
    title: "RSI (14)",
    definition:
      "Relative Strength Index over 14 periods. Oscillates 0–100. Below 30 = oversold (possible bounce setup), above 70 = overbought (possible pullback). Around 50 is neutral.",
  },
  macd: {
    title: "MACD",
    definition:
      "Moving Average Convergence Divergence — the difference between a stock's 12- and 26-period EMAs. Above zero = bullish momentum, below = bearish. Crossing zero is a regime-change signal.",
  },
  macd_signal: {
    title: "MACD Signal Line",
    definition:
      "9-period EMA of the MACD line itself. Used as the trigger: when MACD crosses above the signal, it's bullish; below, bearish.",
  },
  macd_spread: {
    title: "MACD Spread",
    definition:
      "MACD minus the signal line. Positive = bullish momentum and widening; negative = bearish. The bigger the absolute spread, the stronger the recent momentum.",
  },
  tv_rating: {
    title: "TradingView Rating",
    definition:
      "TradingView's composite technical rating on a -1 to +1 scale, aggregating 26 indicators across moving averages and oscillators on the 1-day timeframe. ≥0.5 = Strong Buy, 0.1–0.5 = Buy, -0.1 to 0.1 = Neutral, ≤-0.5 = Strong Sell.",
  },
  tv_rating_ma: {
    title: "Moving Averages Rating",
    definition:
      "TradingView's rating based on moving-average signals only (SMA/EMA across several periods). Useful for isolating trend strength from oscillator noise.",
  },
  tv_rating_osc: {
    title: "Oscillators Rating",
    definition:
      "TradingView's rating based on oscillators only (RSI, Stochastic, MACD, CCI, Williams %R, etc.). Useful for assessing momentum independent of trend.",
  },
  stoch_k: {
    title: "Stochastic %K",
    definition:
      "Stochastic oscillator 0–100. Compares the close to the recent high-low range. Below 20 = oversold, above 80 = overbought. Faster-moving than RSI.",
  },
  adx: {
    title: "ADX",
    definition:
      "Average Directional Index, 0–100. Measures trend STRENGTH only (not direction). Below 20 = no trend / choppy, 25+ = trending, 40+ = strong trend, 50+ = very strong.",
  },
  ema20: {
    title: "EMA (20)",
    definition:
      "20-day Exponential Moving Average. Weighted toward recent prices. Common short-term trend reference and a typical pullback support level in uptrends.",
  },
  ema50: {
    title: "EMA (50)",
    definition:
      "50-day Exponential Moving Average. Intermediate-term trend reference, more responsive than the SMA50 to recent moves.",
  },
  sma50: {
    title: "SMA (50)",
    definition:
      "50-day Simple Moving Average. Intermediate-term trend reference. Price above = intermediate uptrend, below = downtrend.",
  },
  sma200: {
    title: "SMA (200)",
    definition:
      "200-day Simple Moving Average. The textbook long-term trend reference: price above = bull market structure, below = bear-market structure.",
  },
  bb_upper: {
    title: "Bollinger Band — Upper",
    definition:
      "20-day SMA plus 2 standard deviations. Touching the upper band suggests price is stretched to the upside; sustained closes above it indicate strong momentum.",
  },
  bb_lower: {
    title: "Bollinger Band — Lower",
    definition:
      "20-day SMA minus 2 standard deviations. Touching the lower band suggests price is stretched to the downside; potential mean-reversion zone.",
  },
  market_cap: {
    title: "Market Cap",
    definition:
      "Total market value of all outstanding shares (share price × shares outstanding). B = billion, T = trillion.",
  },
  pe: {
    title: "P/E (TTM)",
    definition:
      "Price-to-Earnings ratio using trailing-twelve-months earnings. How many dollars you pay per dollar of recent earnings. Higher = richer valuation; context against sector matters.",
  },
  volume: {
    title: "Volume",
    definition:
      "Number of shares traded so far today. Compare against the 10-day average to gauge whether interest is unusually high or low.",
  },
  avg_volume_10d: {
    title: "10-day Avg Volume",
    definition:
      "Average daily shares traded over the last 10 trading days. The reference for whether today's volume is heavy or light.",
  },
  vol_ratio: {
    title: "Volume vs 10d",
    definition:
      "Today's volume divided by the 10-day average. ≥1.5× is unusually heavy — often confirms a breakout. Below 1× suggests the move lacks conviction.",
  },
  ema_gap: {
    title: "% above EMA20",
    definition:
      "How far today's close is above the 20-day EMA, as a percent. Larger = price is more extended from its short-term trend line.",
  },
  high52w: {
    title: "52-week High",
    definition:
      "Highest close in the last 52 weeks. Near this level = strength but possible resistance; new highs = breakout territory.",
  },
  low52w: {
    title: "52-week Low",
    definition:
      "Lowest close in the last 52 weeks. Bounce candidates often emerge here, but it's also where downtrends accelerate.",
  },
  pct_from_low52w: {
    title: "Δ from 52w Low",
    definition:
      "Percent the current price sits above the 52-week low. Small values = stock is near a bottom, useful for oversold-bounce scans.",
  },
  pct_from_high52w: {
    title: "Δ from 52w High",
    definition:
      "Percent the current price sits below the 52-week high (negative). Near zero = at highs; very negative = deep in a drawdown.",
  },
  avg_cost: {
    title: "Average Cost",
    definition:
      "Weighted-average price per share you paid for the shares currently held in this position. Resets when net shares hits zero.",
  },
  cost_basis: {
    title: "Cost Basis",
    definition:
      "Total dollars committed to this position (shares × average cost). The reference point for unrealized P/L.",
  },
  market_value: {
    title: "Market Value",
    definition:
      "Current market value of the position (shares × current price).",
  },
  unrealized_pnl: {
    title: "Unrealized P/L",
    definition:
      "Paper gain/loss on positions still open. Market value minus cost basis. Becomes real only when you sell.",
  },
  realized_pnl: {
    title: "Realized P/L",
    definition:
      "Locked-in gain/loss from positions you've already closed (sold). Sum of (sell proceeds − cost-of-sold − commissions) across closed trades.",
  },
  total_value: {
    title: "Total Value",
    definition:
      "Cash + market value of all open positions. The simulation's current portfolio value.",
  },
  starting_cash: {
    title: "Starting Cash",
    definition:
      "The amount the simulation was funded with at creation. P/L is measured against this baseline.",
  },
  max_drawdown: {
    title: "Max Drawdown",
    definition:
      "Largest peak-to-trough decline in the portfolio's equity curve since the simulation started, as a percent of the prior peak.",
  },
  commission: {
    title: "Commission per Trade",
    definition:
      "Fixed dollar cost subtracted from cash on each trade in this simulation, to model brokerage fees.",
  },
  slippage_bps: {
    title: "Slippage",
    definition:
      "Execution-price worsening in basis points (100 bps = 1%). Buys pay slightly more, sells receive slightly less than the live price. Models real-world bid/ask spread + market impact.",
  },
  max_position_pct: {
    title: "Max Position Size",
    definition:
      "Soft cap (as % of total portfolio value at buy time) for any single position. Blocks a buy that would push a holding above this limit.",
  },
  shares: {
    title: "Shares",
    definition:
      "Number of shares held. Fractional shares are supported when buying by dollar amount.",
  },
  conviction_score: {
    title: "Conviction Score",
    definition:
      "0–100 score representing 'how much of my capital would I commit to this stock today, given the technical setup and recent news.' 80+ = strong, 60-79 = lean buy, 40-59 = mixed, 20-39 = lean pass, below 20 = pass.",
  },
  strategy_strong_buy: {
    title: "TV Strong Buy",
    definition:
      "Stocks where TradingView's composite technical rating is ≥0.5 — the platform's own Strong Buy bucket.",
  },
  strategy_oversold: {
    title: "Oversold Bounce",
    definition:
      "Stocks with RSI(14) below 30. Statistical bias toward a short-term rebound, though confirmation (e.g. a bullish reversal candle) usually matters.",
  },
  strategy_breakout: {
    title: "Momentum Breakout",
    definition:
      "Stocks above all three major moving averages (EMA20 > SMA50 > SMA200) with a positive day. Ranked by trend strength × volume confirmation.",
  },
  strategy_macd_cross: {
    title: "MACD Bullish Cross",
    definition:
      "Stocks where the MACD line sits above its signal line — momentum has turned positive on the daily timeframe.",
  },
  strategy_signals: {
    title: "Strategy Signals",
    definition:
      "Which of the four tracked buy strategies this stock currently fires on. Several can fire at once; absence is not a sell signal, just no firing setup.",
  },
};
