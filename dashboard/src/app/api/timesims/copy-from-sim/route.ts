import { NextResponse } from "next/server";
import { readOne as readSim } from "@/lib/sim-store";
import {
  upsertOne as upsertTimeSim,
  makeId,
  makeTradeId,
} from "@/lib/timesim-store";
import { reconcile } from "@/lib/sim-engine";
import { closeOnOrBefore } from "@/lib/timesim-engine";
import { fetchManyDailyCloses } from "@/lib/yahoo";
import type { Simulation, Trade } from "@/lib/types-sim";

export const dynamic = "force-dynamic";

/**
 * POST /api/timesims/copy-from-sim
 *
 * Body: { simId: string, name?: string, startDate?: 'YYYY-MM-DD' }
 *
 * Forks a live Simulation into a new Time Simulation as if it had been
 * created on `startDate` with the same dollar allocations.
 *
 * Semantics:
 *   - We take the source's CURRENT open positions (final state after all
 *     trades). Each position has a cost basis — that's the dollars the
 *     source put into the name.
 *   - For each open position we emit one synthetic BUY on `startDate`
 *     priced at that day's historical close. The BUY spends the same
 *     dollar amount (the cost basis) — so the share count is
 *     `costBasis / startDateClose`, which usually differs from the source's
 *     share count.
 *   - `startingCash` = source's final cash + sum of cost bases. After the
 *     synthetic BUYs apply, the new sim's cash lands back at the source's
 *     final cash, and the dollar allocation across symbols matches the
 *     source exactly.
 *   - Buys are dated 13:00 UTC on `startDate` so any user-added same-day
 *     trades (added at 16:00 UTC) come after them. They carry zero
 *     commission/slippage — they represent the carry-over state, not real
 *     fills.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    simId?: string;
    name?: string;
    startDate?: string;
  };
  const simId = (body.simId ?? "").trim();
  if (!simId) {
    return NextResponse.json({ error: "simId required" }, { status: 400 });
  }

  const source = await readSim(simId);
  if (!source) {
    return NextResponse.json(
      { error: "Source simulation not found" },
      { status: 404 },
    );
  }

  const name = (body.name ?? "").trim() || `${source.name} (time copy)`;

  const today = new Date().toISOString().slice(0, 10);
  const rawStart = (body.startDate ?? "").slice(0, 10);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : today;

  // 1. Reconcile the source in full (no asOf) so we see its FINAL open
  //    positions and cash balance. We replicate that state at startDate,
  //    not the state the source happened to be in on startDate (which
  //    could be empty if startDate predates the source's first trade).
  const { cash: cashFinal, positions: positionsFinal } = reconcile(source);

  // 2. Fetch the historical close on startDate for each held symbol so we
  //    can price the synthetic BUY.
  const heldSymbols = positionsFinal
    .filter((p) => p.shares > 0)
    .map((p) => p.symbol.toUpperCase());

  let closes: Record<string, Record<string, number>> = {};
  if (heldSymbols.length > 0) {
    try {
      closes = await fetchManyDailyCloses(heldSymbols, "10y");
    } catch {
      /* fall back to avg cost below if Yahoo is unreachable */
    }
  }

  // 3. Build initial BUY trades, sizing each by the source's cost basis
  //    (dollars spent on that name) and dividing by startDate's price to
  //    get the share count at that earlier moment.
  const buyTimestamp = new Date(startDate + "T13:00:00.000Z").toISOString();
  const initialTrades: Trade[] = [];
  let totalAllocated = 0;

  for (const p of positionsFinal) {
    if (p.shares <= 0) continue;
    const historicalClose = closeOnOrBefore(closes[p.symbol], startDate);
    // If no historical price, fall back to the source's avg cost so the
    // dollar allocation is still preserved (in which case share count
    // matches the source).
    const avgCost = p.costBasis / p.shares;
    const execPrice =
      typeof historicalClose === "number" && historicalClose > 0
        ? historicalClose
        : avgCost;
    if (!(execPrice > 0)) continue;

    const dollarAllocation = p.costBasis;
    const sharesAtStart = dollarAllocation / execPrice;
    totalAllocated += dollarAllocation;

    initialTrades.push({
      id: makeTradeId(),
      symbol: p.symbol,
      tvTicker: p.tvTicker,
      side: "BUY",
      shares: sharesAtStart,
      price: execPrice,
      commission: 0,
      slippage: 0,
      timestamp: buyTimestamp,
      note: `Initial position from "${source.name}" — same $${dollarAllocation.toFixed(2)} as source`,
    });
  }

  // 4. Starting cash = source's final cash + sum of cost bases. After the
  //    synthetic BUYs deduct totalAllocated, cash lands at cashFinal.
  const startingCash = cashFinal + totalAllocated;

  const sim: Simulation = {
    id: makeId(name),
    name,
    description: source.description
      ? `${source.description} — forked from live sim "${source.name}" on ${startDate}`
      : `Forked from live sim "${source.name}" on ${startDate}`,
    startingCash,
    commissionPerTrade: source.commissionPerTrade,
    slippageBps: source.slippageBps,
    maxPositionPct: source.maxPositionPct,
    createdAt: new Date().toISOString(),
    startDate,
    trades: initialTrades,
  };

  await upsertTimeSim(sim);

  return NextResponse.json(
    {
      simulation: sim,
      forkedAt: startDate,
      sourceCashFinal: cashFinal,
      totalAllocated,
      sourcePositionsCount: heldSymbols.length,
      initialTradesCreated: initialTrades.length,
    },
    { status: 201 },
  );
}
