import { NextResponse } from "next/server";
import { readOne, upsertOne } from "@/lib/timesim-store";
import { fetchManyDailyBars } from "@/lib/yahoo";
import { runAutoRules, AUTO_NOTE_PREFIX } from "@/lib/auto-rules-engine";
import { SP500 } from "@/lib/sp500";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/timesims/[id]/run-rules
 *
 * Body: { endDate?: 'YYYY-MM-DD' }
 *
 * Runs the auto-trading engine end-to-end:
 *   1. Strips any prior auto-trades from the sim (keeps manual ones).
 *   2. Pre-fetches 2y of bars for the configured universe (S&P 500 for v1).
 *   3. Simulates startDate → endDate day-by-day, firing SL/TP sells and
 *      reinvesting freed cash into the top scanner pick per the rules.
 *   4. Persists the generated trades and returns the dailySnapshots series
 *      so the client step-through player can scrub through them without
 *      further API calls.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sim = await readOne(params.id);
  if (!sim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!sim.autoRules) {
    return NextResponse.json(
      { error: "No auto-rules configured on this simulation" },
      { status: 400 },
    );
  }
  if (!sim.startDate) {
    return NextResponse.json(
      { error: "Simulation has no startDate" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    endDate?: string;
  };
  const today = new Date().toISOString().slice(0, 10);
  const endDate =
    body.endDate && DATE_RE.test(body.endDate) ? body.endDate : today;
  if (endDate < sim.startDate) {
    return NextResponse.json(
      { error: "endDate must be on or after startDate" },
      { status: 400 },
    );
  }

  // Universe is fixed to S&P 500 in v1; also include any symbols the sim
  // already holds so manual positions get bar data for SL/TP evaluation.
  const sp500Syms = SP500.map((e) => e.symbol);
  const manualSyms = Array.from(
    new Set(sim.trades.map((t) => t.symbol.toUpperCase())),
  );
  const universe = Array.from(new Set([...sp500Syms, ...manualSyms]));

  // 2y is enough for SMA200 + a year of backtest. For longer-running sims
  // we widen to 5y so SMA200 stays valid.
  const yrs =
    (Date.parse(endDate) - Date.parse(sim.startDate)) /
    (1000 * 60 * 60 * 24 * 365);
  const range = yrs > 1.5 ? "5y" : "2y";

  const bars = await fetchManyDailyBars(universe, range, 12);

  const result = runAutoRules({
    sim,
    rules: sim.autoRules,
    barsBySymbol: bars,
    startDate: sim.startDate,
    endDate,
  });

  // Persist the regenerated trade list back to the sim.
  await upsertOne({ ...sim, trades: result.trades });

  return NextResponse.json({
    ok: true,
    startDate: sim.startDate,
    endDate,
    universeSize: Object.keys(bars).length,
    generatedTrades: result.generatedTrades.length,
    dailySnapshots: result.dailySnapshots,
    autoNotePrefix: AUTO_NOTE_PREFIX,
  });
}
