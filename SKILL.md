---
name: tradesss-analyze-stocks
description: Process pending stock analysis requests for the tradesss dashboard
---

Process all pending stock analysis requests for the tradesss dashboard.

## Objective

The user runs a personal stock-research dashboard at `C:\Users\tayla\Documents\Claude\Projects\tradesss\dashboard`. When they click "Request analysis" on a stock page, the dashboard writes a JSON request to `data/analysis-queue/{SYMBOL}.json`. Your job is to process every pending request: write a pros/cons analysis plus three-horizon conviction scores, save it to `data/analyses/{SYMBOL}.json`, then delete the request file.

The dashboard's storage backend is Postgres — but you do not talk to the database. Your sandbox has no network access; it only has file-system access to the project folder. The dashboard syncs these JSON files in and out of Postgres automatically. Just read queue files, write result files, delete queue files. Treat the file system as the only interface.

## Steps

1. List the contents of `C:\Users\tayla\Documents\Claude\Projects\tradesss\dashboard\data\analysis-queue\`. If the folder doesn't exist or is empty, report "No pending analysis requests" and stop.

2. For each `.json` file in that folder:

   a. Read the file. It contains a request like:
      ```json
      {
        "symbol": "AAPL",
        "tvTicker": "NASDAQ:AAPL",
        "name": "Apple Inc.",
        "requestedAt": "2026-05-11T17:00:00Z",
        "snapshot": {
          "price": 215.20, "change": 0.9, "rsi": 59,
          "macd": 1.8, "macdSignal": 1.2,
          "ema20": 210, "sma50": 205, "sma200": 190,
          "ratingAll": 0.4, "ratingMA": 0.48, "ratingOsc": 0.3,
          "stochK": 50, "adx": 22, "bbUpper": 220, "bbLower": 205,
          "high52w": 240, "low52w": 165,
          "marketCap": 3300000000000, "pe": 30,
          "sector": "Technology", "industry": "Consumer Electronics",
          "exchange": "NASDAQ"
        }
      }
      ```

   b. Use **web search** to find recent earnings reports, guidance, analyst notes, and material news from the last 90 days for the ticker. Use the company name and ticker in your queries. Aim for 2–4 searches per stock.

   c. Write a balanced **pros/cons analysis** in markdown using this exact structure (no "# Title", no "## Disclaimer", no "## Sources"):
      - One short opening paragraph (~3 sentences) summarizing the recent price action and where the stock stands today.
      - A `## Pros` section with 3–5 bullets. Each bullet starts with a **bolded thesis** followed by 1–2 sentences grounded in the technical snapshot and cited news.
      - A `## Cons` section with 3–5 bullets, same format.
      - A short `## The setup` closing paragraph (~3 sentences) describing the current risk/reward and what to watch for next.

      Tone: specific, quantitative, neutral. Use "bulls argue" / "bears point to". Never recommend buy/sell. No hype words.

   d. **Compute THREE conviction scores**, one per horizon. Each is an integer 0–100 representing "of fresh capital I were deploying, how much would I put into a BUY here for THAT horizon" — same scale, different time frame.

      | Horizon key | Time frame | What dominates |
      |---|---|---|
      | `shortTerm` | 1–3 months | Technicals — oscillator extension, position vs 52-week high, RSI/Stoch, upper-BB proximity, near-term binary catalysts (earnings within the window) |
      | `midTerm` | 6–12 months | Trend + the next 1–2 earnings prints + product/guidance cadence + analyst-target gap to spot |
      | `longTerm` | 2–3 years | Fundamentals-dominant — quality of the business, secular thesis, valuation through-cycle, capital allocation, competitive moat |

      Use this scale across all three:

      | Score | Band | Meaning |
      |-------|------|---------|
      | 80–100 | Strong | Take a full position for that horizon. |
      | 60–79 | Lean buy | Mostly favorable but some reason to size smaller. |
      | 40–59 | Mixed | Genuine two-sided setup. Half position or wait for confirmation. |
      | 20–39 | Lean pass | More to dislike than like — better entry coming. |
      | 0–19 | Pass | Bad setup for that horizon. |

      **Calibration anchors:**
      - A stock at a 52-week high with RSI > 70 right before earnings: `shortTerm` ≤ 20 even if fundamentals are excellent.
      - A stock with broken 200-day SMA, missed guidance: `longTerm` < 30 unless the fundamental thesis is intact and just mispriced.
      - It is **expected and healthy** for the three scores to disagree. A stretched chart on a great business should look like e.g. short=12, mid=40, long=70.
      - Use the full range. Don't cluster everything around 50.

      Also write a **1–2 sentence rationale per horizon** explaining the score in plain language. Focus each rationale on what drives that specific time frame's verdict (not the others).

   e. Write the result to `C:\Users\tayla\Documents\Claude\Projects\tradesss\dashboard\data\analyses\{SYMBOL}.json` with this exact schema:

      ```json
      {
        "symbol": "AAPL",
        "generatedAt": "<ISO timestamp NOW>",
        "model": "claude-cowork",
        "usedWebSearch": true,
        "markdown": "<your full markdown analysis>",
        "sources": [
          {"title": "Source page title", "url": "https://..."}
        ],
        "scores": {
          "shortTerm": 25,
          "midTerm": 55,
          "longTerm": 72
        },
        "rationales": {
          "shortTerm": "Why the 1–3 month verdict is what it is.",
          "midTerm": "Why the 6–12 month verdict is what it is.",
          "longTerm": "Why the 2–3 year verdict is what it is."
        },
        "snapshot": {
          "price": <from request>,
          "change": <from request>,
          "rsi": <from request>,
          "rating": <ratingAll from request>
        }
      }
      ```

      JSON must be valid (escape quotes and newlines in markdown / rationale strings properly).

      Create `data/analyses` first if it doesn't exist. To avoid the dashboard ingesting a half-written file, write to `data/analyses/{SYMBOL}.json.tmp` first, then atomically rename it to `data/analyses/{SYMBOL}.json` once the file is complete and valid JSON.

   f. After the analysis file is confirmed written (and renamed from `.tmp` to `.json`), **delete** the request file from `data/analysis-queue/{SYMBOL}.json`. Do not delete it until the analysis file is on disk.

3. At the end, output a concise summary: how many analyses you wrote, which tickers, the three scores per ticker, and any failures (with reasons).

## Constraints

- **Path matters.** All file ops are absolute under `C:\Users\tayla\Documents\Claude\Projects\tradesss\dashboard\data\`. Don't write anywhere else.
- **Process every request.** Even if one fails, continue with the rest.
- **Never write a partial file.** Only write `data/analyses/{SYMBOL}.json` when you have a complete markdown body, three scores (all 0–100 integers), and three rationales. If web search fails, still produce a technical-only analysis (note "no recent news found" in the opening paragraph) — but never write an empty or partial file.
- **Idempotent on success.** A successfully processed request must be removed from the queue.
- **Not financial advice.** The dashboard renders a disclaimer; you don't need one in the markdown.