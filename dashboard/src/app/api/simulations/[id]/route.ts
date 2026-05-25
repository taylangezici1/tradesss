import { NextResponse } from "next/server";
import {
  deleteOne,
  readOne,
  upsertOne,
} from "@/lib/sim-store";
import { valuation } from "@/lib/sim-engine";
import { fetchManyDailyCloses } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const sim = await readOne(params.id);
  if (!sim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Fetch current prices for held symbols
  const symbols = Array.from(new Set(sim.trades.map((t) => t.symbol.toUpperCase())));
  let closesBySymbol: Record<string, Record<string, number>> = {};
  if (symbols.length > 0) {
    try {
      closesBySymbol = await fetchManyDailyCloses(symbols, "5d");
    } catch {
      /* skip */
    }
  }
  const prices: Record<string, { price: number; dayChangePct: number | null }> = {};
  for (const [sym, closes] of Object.entries(closesBySymbol)) {
    const days = Object.keys(closes).sort();
    if (days.length === 0) continue;
    const last = closes[days[days.length - 1]];
    const prev = days.length >= 2 ? closes[days[days.length - 2]] : null;
    prices[sym] = {
      price: last,
      dayChangePct: prev ? ((last - prev) / prev) * 100 : null,
    };
  }

  const v = valuation(sim, prices);
  return NextResponse.json({
    ...v,
    config: {
      commissionPerTrade: sim.commissionPerTrade,
      slippageBps: sim.slippageBps,
      maxPositionPct: sim.maxPositionPct,
    },
    trades: sim.trades,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sim = await readOne(params.id);
  if (!sim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as Partial<{
    name: string;
    description: string;
    commissionPerTrade: number;
    slippageBps: number;
    maxPositionPct: number | null;
  }>;
  if (typeof body.name === "string") sim.name = body.name.trim();
  if (typeof body.description === "string")
    sim.description = body.description || undefined;
  if (typeof body.commissionPerTrade === "number")
    sim.commissionPerTrade = body.commissionPerTrade;
  if (typeof body.slippageBps === "number")
    sim.slippageBps = body.slippageBps;
  if (body.maxPositionPct === null) sim.maxPositionPct = undefined;
  else if (typeof body.maxPositionPct === "number")
    sim.maxPositionPct = body.maxPositionPct;

  await upsertOne(sim);
  return NextResponse.json({ simulation: sim });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ok = await deleteOne(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
