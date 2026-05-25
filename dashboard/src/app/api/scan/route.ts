import { NextResponse } from "next/server";
import { fetchUniverse } from "@/lib/tradingview";
import { classify } from "@/lib/strategies";
import type { ScanResult } from "@/lib/types";

// Cache the scan for 5 minutes to avoid hammering TradingView.
let cache: { at: number; data: ScanResult } | null = null;
const TTL_MS = 5 * 60 * 1000;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    const stocks = await fetchUniverse();
    const strategies = classify(stocks);
    const result: ScanResult = {
      generatedAt: new Date().toISOString(),
      universeSize: stocks.length,
      strategies,
    };
    cache = { at: Date.now(), data: result };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch from TradingView", detail: message },
      { status: 502 },
    );
  }
}
