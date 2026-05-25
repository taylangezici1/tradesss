import { NextResponse } from "next/server";
import { readOne } from "@/lib/sim-store";
import { equityCurve } from "@/lib/sim-engine";
import { fetchManyDailyCloses, tradingDaysBetween } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export async function GET(
  _req: Request,
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

  const symbols = Array.from(
    new Set(sim.trades.map((t) => t.symbol.toUpperCase())),
  );

  // Range: from earliest trade to today
  const sortedTrades = [...sim.trades].sort(
    (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
  );
  const startDate = dateOnly(sortedTrades[0].timestamp);
  const endDate = new Date().toISOString().slice(0, 10);

  // Choose a reasonable Yahoo range based on time span
  const daysSpan =
    (Date.now() - +new Date(startDate)) / (1000 * 60 * 60 * 24);
  const range =
    daysSpan <= 30 ? "1mo" :
    daysSpan <= 90 ? "3mo" :
    daysSpan <= 180 ? "6mo" :
    daysSpan <= 365 ? "1y" :
    daysSpan <= 730 ? "2y" :
    "5y";

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
