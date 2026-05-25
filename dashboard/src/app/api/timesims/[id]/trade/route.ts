import { NextResponse } from "next/server";
import { readOne, upsertOne, makeTradeId } from "@/lib/timesim-store";
import {
  applySlippage,
  reconcile,
  validateBuy,
} from "@/lib/sim-engine";
import { closeOnOrBefore } from "@/lib/timesim-engine";
import { fetchDailyCloses } from "@/lib/yahoo";
import { resolveTicker } from "@/lib/tradingview";
import type { Side, Trade } from "@/lib/types-sim";

export const dynamic = "force-dynamic";

interface TradeRequest {
  symbol: string;
  tvTicker?: string;
  side: Side;
  shares?: number;
  dollars?: number;
  price?: number; // optional; if absent we look up close on `date`
  date: string; // YYYY-MM-DD — trade date
  note?: string;
}

function dateRangeForLookup(date: string): string {
  const ageDays =
    (Date.now() - +new Date(date)) / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return "3mo";
  if (ageDays <= 90) return "6mo";
  if (ageDays <= 180) return "1y";
  if (ageDays <= 365) return "2y";
  if (ageDays <= 730) return "5y";
  return "10y";
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sim = await readOne(params.id);
  if (!sim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as Partial<TradeRequest>;
  const symbol = (body.symbol ?? "").toUpperCase().trim();
  const side = body.side as Side;
  const sharesIn = body.shares !== undefined ? Number(body.shares) : NaN;
  const dollarsIn = body.dollars !== undefined ? Number(body.dollars) : NaN;
  const hasShares = Number.isFinite(sharesIn) && sharesIn > 0;
  const hasDollars = Number.isFinite(dollarsIn) && dollarsIn > 0;
  const date = (body.date ?? "").slice(0, 10);

  if (!symbol)
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  if (side !== "BUY" && side !== "SELL")
    return NextResponse.json(
      { error: "side must be BUY or SELL" },
      { status: 400 },
    );
  if (!hasShares && !hasDollars)
    return NextResponse.json(
      { error: "shares or dollars must be > 0" },
      { status: 400 },
    );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  // 1. Determine base price: provided, else look up close on `date` from Yahoo.
  let basePrice = Number(body.price ?? NaN);
  let tvTicker = body.tvTicker;

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    try {
      const closes = await fetchDailyCloses(symbol, dateRangeForLookup(date));
      const px = closeOnOrBefore(closes, date);
      if (typeof px === "number") basePrice = px;
    } catch {
      /* fall through to live lookup */
    }
  }
  // 2. If we still have no price and no tvTicker, fall back to TradingView live
  //    (also gives us a clean tvTicker like NASDAQ:AAPL for the trade record).
  if (!tvTicker || !Number.isFinite(basePrice) || basePrice <= 0) {
    try {
      const live = await resolveTicker(symbol);
      if (live) {
        tvTicker = tvTicker ?? live.tvTicker;
        if ((!Number.isFinite(basePrice) || basePrice <= 0) && live.close) {
          basePrice = live.close;
        }
      }
    } catch {
      /* no-op */
    }
  }
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return NextResponse.json(
      { error: `Could not determine a price for ${symbol} on ${date}` },
      { status: 502 },
    );
  }

  const execPrice = applySlippage(basePrice, side, sim.slippageBps);
  const commission = sim.commissionPerTrade || 0;
  const shares = hasShares ? sharesIn : dollarsIn / execPrice;
  if (!(shares > 0)) {
    return NextResponse.json({ error: "computed shares <= 0" }, { status: 400 });
  }
  const slippageDollars = Math.abs(execPrice - basePrice) * shares;

  // Reconcile the sim at this trade's instant (so we evaluate cash/positions
  // using only the trades that happened before this one chronologically).
  const tradeMoment = new Date(date + "T16:00:00.000Z"); // 4pm UTC ~ US close
  if (side === "BUY") {
    const { cash, positions } = reconcile(sim, tradeMoment);
    const positionsValue = positions.reduce(
      (sum, p) => sum + p.shares * basePrice,
      0,
    );
    const currentTotal = cash + positionsValue;
    const err = validateBuy(sim, symbol, shares, execPrice, currentTotal);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const costNeeded = execPrice * shares + commission;
    if (cash < costNeeded) {
      return NextResponse.json(
        {
          error: `Insufficient cash on ${date}: need $${costNeeded.toFixed(
            2,
          )}, have $${cash.toFixed(2)}`,
        },
        { status: 400 },
      );
    }
  } else {
    const { positions } = reconcile(sim, tradeMoment);
    const pos = positions.find(
      (p) => p.symbol.toUpperCase() === symbol,
    );
    if (!pos || pos.shares < shares - 1e-9) {
      return NextResponse.json(
        {
          error: `Insufficient shares of ${symbol} on ${date}: have ${
            pos?.shares ?? 0
          }, trying to sell ${shares}`,
        },
        { status: 400 },
      );
    }
  }

  const trade: Trade = {
    id: makeTradeId(),
    symbol,
    tvTicker: tvTicker ?? `NASDAQ:${symbol}`,
    side,
    shares,
    price: execPrice,
    commission,
    slippage: slippageDollars,
    timestamp: tradeMoment.toISOString(),
    note: body.note?.toString() || undefined,
  };
  sim.trades.push(trade);
  await upsertOne(sim);

  return NextResponse.json({ trade });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sim = await readOne(params.id);
  if (!sim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const tradeId = url.searchParams.get("tradeId");
  if (!tradeId) {
    return NextResponse.json(
      { error: "tradeId query param required" },
      { status: 400 },
    );
  }
  const before = sim.trades.length;
  sim.trades = sim.trades.filter((t) => t.id !== tradeId);
  if (sim.trades.length === before) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  await upsertOne(sim);
  return NextResponse.json({ ok: true });
}
