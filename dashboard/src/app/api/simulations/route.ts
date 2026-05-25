import { NextResponse } from "next/server";
import { readAll, upsertOne, makeId } from "@/lib/sim-store";
import { valuation } from "@/lib/sim-engine";
import { fetchManyDailyCloses } from "@/lib/yahoo";
import type { Simulation } from "@/lib/types-sim";

export const dynamic = "force-dynamic";

export async function GET() {
  const sims = await readAll();
  if (sims.length === 0) {
    return NextResponse.json({ simulations: [] });
  }

  // Collect unique symbols across all sims, fetch latest close for each via Yahoo
  const allSymbols = new Set<string>();
  for (const s of sims) {
    for (const t of s.trades) allSymbols.add(t.symbol.toUpperCase());
  }
  let closesBySymbol: Record<string, Record<string, number>> = {};
  if (allSymbols.size > 0) {
    try {
      closesBySymbol = await fetchManyDailyCloses(
        Array.from(allSymbols),
        "5d",
      );
    } catch {
      // ignore — current price will be missing
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

  const summaries = sims
    .map((s) => valuation(s, prices))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  // Strip positions from summary
  return NextResponse.json({
    simulations: summaries.map(({ positions, ...rest }) => { void positions; return rest; }),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Simulation>;
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const startingCash = Number(body.startingCash ?? 100_000);
  if (!(startingCash > 0)) {
    return NextResponse.json(
      { error: "startingCash must be > 0" },
      { status: 400 },
    );
  }
  const sim: Simulation = {
    id: makeId(name),
    name,
    description: body.description?.toString() || undefined,
    startingCash,
    commissionPerTrade: Number(body.commissionPerTrade ?? 0),
    slippageBps: Number(body.slippageBps ?? 0),
    maxPositionPct: body.maxPositionPct
      ? Number(body.maxPositionPct)
      : undefined,
    createdAt: new Date().toISOString(),
    trades: [],
  };
  await upsertOne(sim);
  return NextResponse.json({ simulation: sim }, { status: 201 });
}
