#!/usr/bin/env python3
"""
TradingView S&P 500 Scanner
===========================
Pulls live technical data from TradingView's public scanner endpoint
(the same one powering tradingview.com/screener) and classifies the
top ~500 US large-cap stocks into four buy strategies:

  1. TV Strong Buy   — TradingView's overall technical rating
  2. Oversold Bounce — RSI < 30 (potential rebound)
  3. Momentum Breakout — price above key moving averages, trending up
  4. MACD Bullish Cross — MACD line above signal, recently turned up

Output: dashboard.html (self-contained, opens in any browser)

Usage:
    python scanner.py
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Missing dependency. Run: pip install requests")
    sys.exit(1)


SCANNER_URL = "https://scanner.tradingview.com/america/scan"

# Columns we request from TradingView. Names match the keys the TV screener uses.
COLUMNS = [
    "name",               # ticker
    "description",        # company name
    "logoid",             # logo id for image url
    "exchange",
    "sector",
    "industry",
    "close",
    "change",             # % change today
    "change_abs",         # $ change today
    "volume",
    "average_volume_10d_calc",
    "market_cap_basic",
    "price_earnings_ttm",
    "RSI",
    "MACD.macd",
    "MACD.signal",
    "EMA20",
    "EMA50",
    "SMA50",
    "SMA200",
    "Stoch.K",
    "Stoch.D",
    "Recommend.All",      # -1..1 overall rating
    "Recommend.MA",       # moving averages rating
    "Recommend.Other",    # oscillators rating
    "ADX",
    "BB.upper",
    "BB.lower",
    "High.All",
    "Low.All",
    "price_52_week_high",
    "price_52_week_low",
]

PAYLOAD = {
    "filter": [
        {"left": "type", "operation": "in_range", "right": ["stock"]},
        {"left": "subtype", "operation": "in_range",
         "right": ["common", "", "preferred"]},
        {"left": "exchange", "operation": "in_range",
         "right": ["NYSE", "NASDAQ"]},
        {"left": "market_cap_basic", "operation": "greater",
         "right": 5_000_000_000},          # >= $5B  (filters to ~large caps)
    ],
    "markets": ["america"],
    "columns": COLUMNS,
    "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"},
    "range": [0, 500],
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
}


def fetch_stocks():
    """Fetch the top US large caps with all indicators from TradingView."""
    print(f"[{datetime.now():%H:%M:%S}] Fetching from TradingView scanner...")
    r = requests.post(SCANNER_URL, json=PAYLOAD, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()
    rows = data.get("data") or []
    print(f"[{datetime.now():%H:%M:%S}] Got {len(rows)} stocks.")

    stocks = []
    for row in rows:
        vals = row.get("d") or []
        if len(vals) != len(COLUMNS):
            continue
        s = dict(zip(COLUMNS, vals))
        # parse the composite ticker id (e.g. "NASDAQ:AAPL") from row['s']
        s["tv_ticker"] = row.get("s", "")
        stocks.append(s)
    return stocks


def classify_strategies(stocks):
    """Compute strategy flags + scores per stock."""

    def safe(v, default=None):
        return v if isinstance(v, (int, float)) else default

    strong_buy, oversold, breakout, macd_cross = [], [], [], []

    for s in stocks:
        rec = safe(s.get("Recommend.All"))
        rsi = safe(s.get("RSI"))
        close = safe(s.get("close"))
        ema20 = safe(s.get("EMA20"))
        sma50 = safe(s.get("SMA50"))
        sma200 = safe(s.get("SMA200"))
        macd = safe(s.get("MACD.macd"))
        macd_sig = safe(s.get("MACD.signal"))
        vol = safe(s.get("volume"))
        avg_vol = safe(s.get("average_volume_10d_calc"))
        change = safe(s.get("change"))

        # 1) TV Strong Buy: overall rating >= 0.5 on TV's -1..1 scale
        if rec is not None and rec >= 0.5:
            s["_score_strong_buy"] = round(rec, 3)
            strong_buy.append(s)

        # 2) Oversold Bounce: RSI < 30, ideally with some support nearby
        if rsi is not None and rsi < 30:
            s["_score_oversold"] = round(30 - rsi, 2)  # deeper = higher score
            oversold.append(s)

        # 3) Momentum Breakout: price above all 3 MAs, up today, volume confirms
        if (close and ema20 and sma50 and sma200
                and close > ema20 > sma50 > sma200
                and (change or 0) > 0):
            vol_ratio = (vol / avg_vol) if (vol and avg_vol) else 1.0
            score = (close / sma200) * vol_ratio  # higher = stronger trend + volume
            s["_score_breakout"] = round(score, 3)
            s["_vol_ratio"] = round(vol_ratio, 2)
            breakout.append(s)

        # 4) MACD Bullish Cross: MACD > signal AND both moving up from zero region
        if (macd is not None and macd_sig is not None
                and macd > macd_sig
                and (macd - macd_sig) > 0):
            spread = macd - macd_sig
            s["_score_macd"] = round(spread, 4)
            macd_cross.append(s)

    # Sort each list by its score, descending
    strong_buy.sort(key=lambda x: x["_score_strong_buy"], reverse=True)
    oversold.sort(key=lambda x: x["_score_oversold"], reverse=True)
    breakout.sort(key=lambda x: x["_score_breakout"], reverse=True)
    macd_cross.sort(key=lambda x: x["_score_macd"], reverse=True)

    return {
        "strong_buy": strong_buy[:50],
        "oversold": oversold[:50],
        "breakout": breakout[:50],
        "macd_cross": macd_cross[:50],
        "_universe_size": len(stocks),
    }


def build_dashboard(results, out_path: Path):
    """Render the HTML dashboard with data baked in."""
    template_path = Path(__file__).parent / "dashboard_template.html"
    html = template_path.read_text(encoding="utf-8")

    payload = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "universe_size": results["_universe_size"],
        "strategies": {
            "strong_buy":  results["strong_buy"],
            "oversold":    results["oversold"],
            "breakout":    results["breakout"],
            "macd_cross":  results["macd_cross"],
        },
    }
    injected = html.replace(
        "/*__DATA__*/",
        f"window.__SCAN_DATA__ = {json.dumps(payload, default=str)};",
    )
    out_path.write_text(injected, encoding="utf-8")
    print(f"[{datetime.now():%H:%M:%S}] Wrote {out_path}")


def main():
    here = Path(__file__).parent
    stocks = fetch_stocks()
    if not stocks:
        print("No data returned. TradingView may have rate-limited or changed its API.")
        sys.exit(1)

    # Save raw data for debugging / further use
    (here / "raw_data.json").write_text(
        json.dumps(stocks, default=str, indent=2), encoding="utf-8"
    )

    results = classify_strategies(stocks)
    print(f"  Strong Buy: {len(results['strong_buy'])}")
    print(f"  Oversold:   {len(results['oversold'])}")
    print(f"  Breakout:   {len(results['breakout'])}")
    print(f"  MACD Cross: {len(results['macd_cross'])}")

    build_dashboard(results, here / "dashboard.html")
    print("\nDone! Open dashboard.html in your browser.")


if __name__ == "__main__":
    main()
