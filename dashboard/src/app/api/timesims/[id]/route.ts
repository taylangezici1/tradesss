import { NextResponse } from "next/server";
import {
  deleteOne,
  readOne,
  upsertOne,
} from "@/lib/timesim-store";
import type { AutoRules } from "@/lib/types-sim";
import { valuationAsOf, rangeForSpan } from "@/lib/timesim-engine";
import { fetchManyDailyCloses } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sim = await readOne(params.id);
  if (!sim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const asOf = url.searchParams.get("asOf") || todayStr();

  // Fetch historical closes covering [firstTrade..asOf] for all touched symbols.
  const symbols = Array.from(
    new Set(sim.trades.map((t) => t.symbol.toUpperCase())),
  );
  let closes: Record<string, Record<string, number>> = {};
  if (symbols.length > 0) {
    const firstDate =
      sim.trades.length > 0
        ? [...sim.trades]
            .sort(
              (a, b) =>
                +new Date(a.timestamp) - +new Date(b.timestamp),
            )[0]
            .timestamp.slice(0, 10)
        : asOf;
    const range = rangeForSpan(firstDate, asOf);
    try {
      closes = await fetchManyDailyCloses(symbols, range);
    } catch {
      /* skip */
    }
  }

  const v = valuationAsOf(sim, closes, asOf);
  // Filter the trade list to only those on/before the as-of date so the detail
  // view's "trade history" naturally hides future trades.
  const tradesAsOf = sim.trades.filter(
    (t) => t.timestamp.slice(0, 10) <= asOf,
  );
  return NextResponse.json({
    ...v,
    config: {
      commissionPerTrade: sim.commissionPerTrade,
      slippageBps: sim.slippageBps,
      maxPositionPct: sim.maxPositionPct,
    },
    trades: tradesAsOf,
    allTrades: sim.trades,
    asOfDate: asOf,
    startDate: sim.startDate,
    autoRules: sim.autoRules,
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
    startDate: string | null;
    autoRules: AutoRules | null;
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
  if (body.startDate === null) sim.startDate = undefined;
  else if (
    typeof body.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
  )
    sim.startDate = body.startDate;
  if (body.autoRules === null) sim.autoRules = undefined;
  else if (body.autoRules && typeof body.autoRules === "object")
    sim.autoRules = body.autoRules;

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
