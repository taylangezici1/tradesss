import { NextResponse } from "next/server";
import { fetchDailyCloses } from "@/lib/yahoo";
import { closeOnOrBefore } from "@/lib/timesim-engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/timesims/price?symbol=AAPL&date=2024-03-15
 *
 * Returns the historical close for `symbol` on `date` (or the most recent
 * trading day on or before `date` if that exact day was a weekend/holiday).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase().trim();
  const date = (url.searchParams.get("date") ?? "").slice(0, 10);

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const ageDays = (Date.now() - +new Date(date)) / (1000 * 60 * 60 * 24);
  const range =
    ageDays <= 30 ? "3mo" :
    ageDays <= 90 ? "6mo" :
    ageDays <= 180 ? "1y" :
    ageDays <= 365 ? "2y" :
    ageDays <= 730 ? "5y" :
    "10y";

  try {
    const closes = await fetchDailyCloses(symbol, range);
    const price = closeOnOrBefore(closes, date);
    if (price === null) {
      return NextResponse.json(
        { error: `No close found for ${symbol} on or before ${date}` },
        { status: 404 },
      );
    }
    // Find the actual day used
    const days = Object.keys(closes).sort();
    let actualDay = date;
    if (typeof closes[date] !== "number") {
      for (let i = days.length - 1; i >= 0; i--) {
        if (days[i] <= date) {
          actualDay = days[i];
          break;
        }
      }
    }
    return NextResponse.json({ symbol, date, actualDay, price });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to fetch historical prices",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 502 },
    );
  }
}
