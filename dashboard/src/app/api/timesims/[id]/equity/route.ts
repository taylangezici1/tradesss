import { NextResponse } from "next/server";
import { readOne } from "@/lib/timesim-store";
import { equityCurve } from "@/lib/sim-engine";
import { fetchManyDailyCloses, tradingDaysBetween } from "@/lib/yahoo";
import { rangeForSpan } from "@/lib/timesim-engine";

export const dynamic = "force-dynamic";

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sim = await readOne(params.id);
  if (!sim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (sim.trades.length === 0) {
    return NextResponse.json({
      points: [],
      startingValue: sim.startingCash,
      endingValue: sim.startingCash,
      totalReturn: 0,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
    });
  }

  const url = new URL(req.url);
  const asOf = url.searchParams.get("asOf") ||
    new Date().toISOString().slice(0, 10);

  const symbols = Array.from(
    new Set(sim.trades.map((t) => t.symbol.toUpperCase())),
  );
  const sorted = [...sim.trades].sort(
    (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
  );
  const startDate = dateOnly(sorted[0].timestamp);

  // Cap end date at the as-of selector
  let endDate = asOf;
  if (endDate < startDate) endDate = startDate;

  const range = rangeForSpan(startDate, endDate);

  let closesBySymbol: Record<string, Record<string, number>> = {};
  try {
    closesBySymbol = await fetchManyDailyCloses(symbols, range);
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to fetch historical prices from Yahoo",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 502 },
    );
  }

  const days = tradingDaysBetween(startDate, endDate, closesBySymbol);
  const curve = equityCurve(sim, closesBySymbol, days);
  return NextResponse.json(curve);
}
