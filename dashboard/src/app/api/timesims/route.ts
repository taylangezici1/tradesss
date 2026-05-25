import { NextResponse } from "next/server";
import { readAll, upsertOne, makeId } from "@/lib/timesim-store";
import { valuationAsOf } from "@/lib/timesim-engine";
import { fetchManyDailyCloses } from "@/lib/yahoo";
import type { Simulation } from "@/lib/types-sim";

export const dynamic = "force-dynamic";

/**
 * Time-based simulations. Mirrors the regular /api/simulations endpoint but
 * each simulation is valued "as of" a date the client picks. List view always
 * values each sim at "today" (which acts like a regular paper portfolio
 * snapshot using historical data through today).
 */
export async function GET() {
  const sims = await readAll();
  if (sims.length === 0) {
    return NextResponse.json({ simulations: [] });
  }
  const today = new Date().toISOString().slice(0, 10);

  // Pull closes for every symbol once; "1y" is a reasonable default range for
  // the list page (older time-sims will still get current valuation; we just
  // want recent close).
  const symbols = Array.from(
    new Set(
      sims.flatMap((s) => s.trades.map((t) => t.symbol.toUpperCase())),
    ),
  );
  let closes: Record<string, Record<string, number>> = {};
  if (symbols.length > 0) {
    try {
      closes = await fetchManyDailyCloses(symbols, "5y");
    } catch {
      /* ignore — current prices will be missing */
    }
  }

  const summaries = sims
    .map((s) => ({
      ...valuationAsOf(s, closes, today),
      startDate: s.startDate,
    }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return NextResponse.json({
    simulations: summaries.map(({ positions, ...rest }) => {
      void positions;
      return rest;
    }),
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
  // Optional scenario start date. Defaults to today if not provided.
  const rawStart = (body.startDate ?? "").toString().slice(0, 10);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart)
    ? rawStart
    : new Date().toISOString().slice(0, 10);

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
    startDate,
    autoRules: body.autoRules,
    trades: [],
  };
  await upsertOne(sim);
  return NextResponse.json({ simulation: sim }, { status: 201 });
}
