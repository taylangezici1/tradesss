# tradesss

Personal stock research, paper-trading, and backtesting dashboard. Built around the
TradingView scanner plus a Postgres-backed workspace for tracking ideas, simulating
portfolios at any point in time, generating AI analyses, and running rule-based
auto-trading backtests against the S&P 500.

Not a product — it's a single-user personal tool. Not financial advice.

## What's in it

The project is two layers:

1. **`scanner.py`** — the original lightweight Python script. Pulls ~500 US large caps
   from TradingView's public scanner in one HTTP call and writes `dashboard.html`,
   a static interactive view with the four strategy buckets. Useful when you want a
   quick read without spinning up the full app.
2. **`dashboard/`** — the modern Next.js app. Everything below lives here.

### Pages in the dashboard

| Page | What it does |
|---|---|
| **Scanner** (`/`) | Live TradingView scanner refresh, four strategy tabs (TV Strong Buy, Oversold, Breakout, MACD Cross). Bulk-buy button to seed positions into a simulation. |
| **Watchlist** (`/watchlist`) | Pinned tickers with current quote and rating; per-row notes. |
| **Stock page** (`/stocks/[symbol]`) | TradingView advanced chart + technical-analysis widget, headline stats, strategy-match badges, trade button, watchlist toggle, and the AI analysis panel (request / refresh / view). |
| **Simulations** (`/simulations`) | Live paper-trading portfolios. Real-time pricing from TradingView, weighted-average cost basis, realized + unrealized P/L, equity curve, max-drawdown, per-position sell modal. |
| **Time Sim** (`/time-sim`) | Time-aware portfolios with a backdated trade-date and an as-of-date scrubber — see how the portfolio looked on any past day using historical closes from Yahoo. Supports forking a live simulation into a time copy (`/timesims/copy-from-sim`), and **rule-based auto-trading backtests** (see below). |
| **AI Analyses** (`/analyses`) | Every Claude-generated stock analysis, newest first, with three-horizon conviction scores (short / mid / long) and per-horizon rationales. Stock page surfaces the latest analysis per symbol; full history is preserved. |

### Rule-based auto-trading engine

On any time simulation you can attach an `AutoRules` config:
- **Stop loss %** and **take profit %** thresholds applied to each open position
- **Rule scope**: all positions, or only auto-bought ones
- **Reinvest strategy**: top-1 pick from Oversold / Breakout / MACD Cross
- **Duplicate handling** when the top pick is already held: skip / pyramid / hold cash
- **No-match behavior** when nothing clears the strategy: hold / relaxed pick

Clicking *Run auto-rules* simulates every trading day from `startDate` to your chosen
end date in a single pass. The engine:
1. Reconciles positions as-of EOD.
2. Fires SL/TP sells at that day's close.
3. Runs the historical scanner over the S&P 500 (indicators computed from cached Yahoo
   bars).
4. Buys the top scanner pick with freed cash; also redeploys idle cash after a full
   exit so the rotation doesn't go dormant.
5. Persists the synthetic trades (tagged `AUTO: ...`) and returns a per-day snapshot
   series that powers a step-through player UI (Play / Pause / 1×–5× speed, today's
   trades, scanner top-3 on each day).

Re-runs are idempotent — they clear only the `AUTO: ...` trades and regenerate them.
Manual trades you added are preserved.

### AI analysis pipeline

The Stock page has a *Request analysis* button. That writes a JSON request to
`dashboard/data/analysis-queue/{SYMBOL}.json` (and a mirror row in Postgres). A
scheduled Claude Code task (driven by `SKILL.md` in the repo root) picks those files
up, runs web searches for recent earnings / news, writes a pros/cons markdown plus
three-horizon conviction scores, and drops the result at
`dashboard/data/analyses/{SYMBOL}.json`. The dashboard ingests the file on next read
(append-only, so history is preserved) and the analysis appears in the UI without a
page reload.

The pipeline runs in a sandbox with **no network access** — only file-system writes.
Postgres ingestion is one-way: the dashboard drains result files into the DB and
deletes them.

## Tech stack

**Dashboard (`dashboard/`)**
- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind CSS, lucide-react icons
- Postgres via `pg` — single shared pool, schema bootstrapped lazily on first query
- TradingView widgets for charts / symbol info / technical-analysis panel
- TradingView's public scanner endpoint for the universe scan (no API key)
- Yahoo Finance chart endpoint for historical closes + volumes (no API key)
- `react-markdown` + `remark-gfm` for AI analysis rendering

**Indicator engine** (`dashboard/src/lib/historical-indicators.ts`)
- Pure functions for RSI(14) (Wilder's smoothing), EMA(n), SMA(n), MACD(12,26,9),
  volume ratio, daily % change

**AI pipeline**
- Claude Code (file-system sandbox) driven by `SKILL.md`
- File-bridge to Postgres — no direct API calls from the dashboard

**Original scanner (`scanner.py`)**
- Python 3, `requests` — single dependency

## Setup

### Prereqs

- Node 18+ and yarn
- Postgres 14+ running locally
- (Optional) Python 3 with `requests` if you want the legacy `scanner.py`

### Dashboard

```bash
cd dashboard
yarn install

# Create a local Postgres database
createdb tradesss

# .env.local
cat > .env.local <<EOF
DATABASE_URL=postgresql://postgres:1@localhost:5432/tradesss
EOF

yarn dev
# → http://localhost:3000
```

The schema is created lazily — there's no separate migration step for table layout.
First request to any DB-touching endpoint bootstraps the tables.

### Legacy Python scanner

```bash
pip install requests
python scanner.py
# → opens dashboard.html in your browser
```

## Project structure

```
tradesss/
├── README.md                       — this file
├── SKILL.md                        — Claude Code task spec for AI analysis pipeline
├── scanner.py                      — legacy single-shot Python scanner
├── dashboard.html                  — output of scanner.py (generated)
├── dashboard_template.html         — HTML shell for scanner.py
├── raw_data.json                   — last scan dump (generated)
└── dashboard/                      — Next.js app
    ├── src/
    │   ├── app/                    — App Router pages + API routes
    │   │   ├── page.tsx                          — scanner home
    │   │   ├── stocks/[...symbol]/page.tsx       — stock detail
    │   │   ├── watchlist/                        — watchlist
    │   │   ├── simulations/                      — live paper-trading
    │   │   ├── time-sim/                         — backdated sims + auto-rules
    │   │   ├── analyses/                         — AI analysis history
    │   │   └── api/                              — JSON endpoints
    │   ├── components/             — React components
    │   └── lib/                    — DB, stores, engines
    │       ├── db.ts                             — Postgres pool + schema
    │       ├── tradingview.ts                    — scanner + per-symbol lookup
    │       ├── yahoo.ts                          — historical bars
    │       ├── strategies.ts                     — live-data strategy classifier
    │       ├── historical-indicators.ts          — RSI/EMA/SMA/MACD pure math
    │       ├── historical-scanner.ts             — point-in-time scanner
    │       ├── sim-engine.ts                     — position reconciliation
    │       ├── timesim-engine.ts                 — as-of valuation
    │       ├── auto-rules-engine.ts              — day-by-day backtest engine
    │       ├── sim-store.ts                      — live sims (Postgres)
    │       ├── timesim-store.ts                  — time sims + auto-rules (Postgres)
    │       ├── watchlist-store.ts                — watchlist (Postgres)
    │       ├── analysis-store.ts                 — analyses + file-bridge ingestion
    │       └── analysis-queue.ts                 — pending analysis requests
    └── data/                       — file-bridge for Claude Code
        ├── analysis-queue/                       — pending requests (JSON files)
        └── analyses/                             — completed analyses (JSON files)
```

## Strategies reference

Same definitions across the live scanner and the historical scanner used by the
auto-rules engine. The historical engine drops Strong Buy because it depends on
TradingView's proprietary `Recommend.All` composite, which isn't reproducible from
public price data.

| Strategy | Definition | Available historically? |
|---|---|---|
| **TV Strong Buy** | `ratingAll ≥ 0.5` (composite of 26 indicators) | No |
| **Oversold Bounce** | `RSI(14) < 30`, ranked by `30 − RSI` | Yes |
| **Momentum Breakout** | `close > EMA20 > SMA50 > SMA200` and up today, ranked by trend × volume | Yes |
| **MACD Bullish Cross** | `MACD > signal`, ranked by spread | Yes |

## Notes & caveats

- **Personal tool, not a product.** Single-user, no auth, runs on localhost. The
  scanner endpoint, Yahoo chart endpoint, and TradingView widgets are public but
  unstable APIs — they can change without notice.
- **Not financial advice.** Every strategy, score, and analysis here is a technical
  signal or a model's opinion. Confirm independently before trading.
- **Indicators are point-in-time per call.** The live scanner pulls a snapshot; the
  historical engine recomputes indicators from cached Yahoo daily bars.
- **Universe.** Live scanner = TradingView's top-500 US large caps by market cap.
  Auto-rules backtest universe = a static S&P 500 list bundled in
  `lib/sp500.ts`; constituents drift over time but it's good enough for personal
  backtesting.
