import { NextResponse } from "next/server";
import { readOne, upsertOne, makeTradeId } from "@/lib/sim-store";
import {
  applySlippage,
  reconcile,
  validateBuy,
} from "@/lib/sim-engine";
import { resolveTicker } from "@/lib/tradingview";
import type { Side, Trade } from "@/lib/types-sim";

export const dynamic = "force-dynamic";

interface TradeRequest {
  symbol: string;
  tvTicker?: string;
  side: Side;
  shares?: number;          // either shares OR dollars must be provided
  dollars?: number;         // dollar amount; shares = dollars / execPrice
  price?: number;           // optional; if missing, fetch live
  note?: string;
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

  // Determine execution price: provided > live TradingView
  let basePrice = Number(body.price ?? NaN);
  let tvTicker = body.tvTicker;

  if (!Number.isFinite(basePrice) || basePrice <= 0 || !tvTicker) {
    try {
      const live = await resolveTicker(symbol);
      if (!live || !live.close) {
        return NextResponse.json(
          { error: `Could not fetch live price for ${symbol}` },
          { status: 502 },
        );
      }
      basePrice = live.close;
      tvTicker = tvTicker ?? live.tvTicker;
    } catch (e) {
      return NextResponse.json(
        {
          error: "Failed to fetch live price",
          detail: e instanceof Error ? e.message : "unknown",
        },
        { status: 502 },
      );
    }
  }

  const execPrice = applySlippage(basePrice, side, sim.slippageBps);
  const commission = sim.commissionPerTrade || 0;

  // For BUYs we need a cash snapshot up-front so we can both (a) absorb
  // tiny float drift in dollar-denominated bulk buys that try to deploy
  // exactly 100% of cash and (b) reuse it for the validation below.
  let buyCash = 0;
  let buyPositions: ReturnType<typeof reconcile>["positions"] = [];
  if (side === "BUY") {
    const rec = reconcile(sim);
    buyCash = rec.cash;
    buyPositions = rec.positions;
  }

  // Resolve final share count. If dollars provided, divide by exec price
  // (so the dollars amount equals the total cost of the position, ex-commission).
  let effectiveDollars = dollarsIn;
  if (hasDollars && side === "BUY") {
    const maxSpend = buyCash - commission;
    // Cap when the shortfall is small — almost certainly float drift from
    // a "deploy 100% of cash" bulk buy. Larger overshoots fall through to
    // the explicit insufficient-cash check so the caller gets a clear error.
    if (effectiveDollars > maxSpend && effectiveDollars - maxSpend < 1 && maxSpend > 0) {
      effectiveDollars = maxSpend;
    }
  }
  const shares = hasShares ? sharesIn : effectiveDollars / execPrice;
  if (!(shares > 0)) {
    return NextResponse.json({ error: "computed shares <= 0" }, { status: 400 });
  }
  const slippageDollars = Math.abs(execPrice - basePrice) * shares;

  // Validations
  if (side === "BUY") {
    const positionsValue = buyPositions.reduce(
      (sum, p) => sum + p.shares * basePrice, // approximate using basePrice as we don't have all current prices
      0,
    );
    const currentTotal = buyCash + positionsValue;

    const err = validateBuy(sim, symbol, shares, execPrice, currentTotal);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const costNeeded = execPrice * shares + commission;
    if (buyCash < costNeeded) {
      return NextResponse.json(
        {
          error: `Insufficient cash: need $${costNeeded.toFixed(
            2,
          )}, have $${buyCash.toFixed(2)}`,
        },
        { status: 400 },
      );
    }
  } else {
    // SELL — make sure we have enough shares
    const { positions } = reconcile(sim);
    const pos = positions.find(
      (p) => p.symbol.toUpperCase() === symbol,
    );
    if (!pos || pos.shares < shares) {
      return NextResponse.json(
        {
          error: `Insufficient shares of ${symbol}: have ${
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
    timestamp: new Date().toISOString(),
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
