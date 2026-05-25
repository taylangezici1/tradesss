# tradesss · dashboard

A personal stock scanner web app. Next.js 14 + TypeScript + Tailwind. Data comes from TradingView's public scanner endpoint (no auth, no API key).

## Features

- **Scanner** (`/`) — Top ~500 US large caps classified into four strategies (Strong Buy, Oversold, Breakout, MACD Cross). Sortable, filterable. Multi-select rows and bulk-buy them into a simulation with one click.
- **Ticker deep-dive** (`/stocks/AAPL`) — Live technicals, embedded TradingView charts, **AI analysis** with pros/cons written by Claude (uses live web search for recent news), strategy match indicators.
- **Simulations** (`/simulations`) — Multiple isolated paper-trading portfolios. Equity curves reconstructed from Yahoo Finance historical bars. Manual buy/sell in either shares or USD. Fractional shares supported.
- **Watchlist** (`/watchlist`) — Saved tickers with live status.

## Setup

```bash
cd dashboard
npm install
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY here (optional, only for AI analysis)
npm run dev
```

Then open http://localhost:3000.

### Anthropic API key (for AI analysis only)

The AI analysis feature on the stock detail page calls Claude via Anthropic's API. To enable it:

1. Grab a key at https://console.anthropic.com/settings/keys
2. Add it to `dashboard/.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart `npm run dev`.

Approximate cost per analysis: $0.02–$0.05 with Sonnet + web search, ~$0.005 with Haiku without. The result is cached per ticker in `data/analyses/` so re-opens are free.

Everything else (scanner, watchlist, simulations) works without an API key.

For production:

```bash
npm run build
npm run start
```

## How the data layer works

- Live technicals → `scanner.tradingview.com/america/scan` (called server-side, cached 5min)
- Historical bars for equity curves → Yahoo Finance public chart endpoint (cached 30min in-memory)
- AI analysis → Anthropic Messages API (optionally with `web_search_20250305` tool)
- Watchlist / simulations / cached analyses → JSON files in `data/`

## Strategy logic

All four strategies are pure functions in `src/lib/strategies.ts`. Rules:

| Strategy | Rule |
|---|---|
| TV Strong Buy | Recommend.All ≥ 0.5 (TradingView's -1..+1 composite) |
| Oversold Bounce | RSI(14) < 30 |
| Momentum Breakout | close > EMA20 > SMA50 > SMA200 AND change > 0 |
| MACD Bullish Cross | MACD > MACD.signal |

To change the universe (default: top 500 US, market cap ≥ $5B, NYSE+NASDAQ), edit the `PAYLOAD` in `src/lib/tradingview.ts`.

## Project layout

```
src/
├── app/
│   ├── page.tsx                          Scanner home
│   ├── stocks/[symbol]/page.tsx          Ticker deep-dive
│   ├── simulations/
│   │   ├── page.tsx                      List
│   │   ├── new/page.tsx                  Create form
│   │   └── [id]/page.tsx                 Detail (positions, equity curve, trade history)
│   ├── watchlist/page.tsx
│   └── api/
│       ├── scan/                         Universe + classify
│       ├── stock/[symbol]/               Single ticker
│       ├── stocks/[symbol]/analyze/      AI analysis (GET cached, POST generate)
│       ├── watchlist/
│       └── simulations/
│           ├── route.ts                  List + create
│           └── [id]/
│               ├── route.ts              Get + patch + delete
│               ├── trade/route.ts        Record buy/sell (shares or dollars)
│               └── equity/route.ts       Daily equity curve
├── components/
│   ├── nav.tsx                           Sticky nav + ticker search
│   ├── scanner-view.tsx                  Strategy tabs
│   ├── strategy-table.tsx                Sortable table with multi-select
│   ├── bulk-buy-modal.tsx                Equal-split allocation into a sim
│   ├── trade-button.tsx                  Single-stock buy/sell modal
│   ├── ai-analysis.tsx                   Claude-generated pros/cons
│   ├── simulation-detail.tsx             Sim deep-dive + sell modal
│   ├── simulations-list.tsx
│   ├── new-simulation-form.tsx
│   ├── equity-curve.tsx                  SVG line chart
│   ├── watchlist-view.tsx
│   ├── watchlist-button.tsx
│   ├── tv-widget.tsx                     TradingView Chart / TA / Symbol Info embeds
│   ├── pill.tsx
│   └── stat-card.tsx
└── lib/
    ├── tradingview.ts                    Scanner endpoint client
    ├── yahoo.ts                          Yahoo Finance historical bars
    ├── strategies.ts                     Classification logic
    ├── sim-engine.ts                     Cost basis, valuation, equity curve replay
    ├── sim-store.ts                      JSON persistence for simulations
    ├── watchlist-store.ts
    ├── anthropic-analysis.ts             Claude API client (server-only)
    ├── analysis-models.ts                Client-safe model list
    ├── analysis-store.ts                 JSON cache for analyses
    ├── format.ts                         Number/share/rating formatters
    ├── types.ts                          Scanner types
    ├── types-sim.ts                      Simulation types
    └── utils.ts                          cn()
```

## Disclaimer

Technical analysis and AI-generated commentary, not financial advice. AI output can contain mistakes — verify specific numbers, dates, and claims against the linked sources before acting on anything.
