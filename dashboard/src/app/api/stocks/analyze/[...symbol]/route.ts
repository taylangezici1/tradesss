import { NextResponse } from "next/server";
import { readAnalysis } from "@/lib/analysis-store";
import { cancel, enqueue, getRequest } from "@/lib/analysis-queue";
import { resolveTicker } from "@/lib/tradingview";

export const dynamic = "force-dynamic";

function joinSymbol(segments: string[]): string {
  return segments.map((s) => decodeURIComponent(s)).join("/").toUpperCase();
}

/**
 * GET /api/stocks/analyze/[...symbol]
 *   → 200 with cached analysis if one exists, plus { queued: bool, requestedAt? }
 *   → 200 with { status: "queued", requestedAt } if only a queue request exists
 *   → 404 if nothing exists yet
 */
export async function GET(
  _req: Request,
  { params }: { params: { symbol: string[] } },
) {
  const sym = joinSymbol(params.symbol);
  const [cached, request] = await Promise.all([
    readAnalysis(sym),
    getRequest(sym),
  ]);

  if (cached) {
    // Stale request — drop it if it predates the latest cached run
    if (request && new Date(request.requestedAt) <= new Date(cached.generatedAt)) {
      await cancel(sym);
    }
    const freshRequest =
      request && new Date(request.requestedAt) > new Date(cached.generatedAt)
        ? request.requestedAt
        : undefined;
    return NextResponse.json({
      ...cached,
      queued: !!freshRequest,
      queuedAt: freshRequest,
    });
  }
  if (request) {
    return NextResponse.json(
      {
        status: "queued",
        queued: true,
        queuedAt: request.requestedAt,
        symbol: sym,
      },
      { status: 202 },
    );
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * POST /api/stocks/analyze/[...symbol]
 *   Body: { force?: boolean }
 *   Writes a request to the queue. Cowork's scheduled task picks it up.
 */
export async function POST(
  req: Request,
  { params }: { params: { symbol: string[] } },
) {
  const sym = joinSymbol(params.symbol);
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };

  let stock;
  try {
    stock = await resolveTicker(sym);
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to fetch ticker data",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 502 },
    );
  }
  if (!stock) {
    return NextResponse.json(
      { error: `Ticker ${sym} not found` },
      { status: 404 },
    );
  }

  const request = await enqueue(stock);
  return NextResponse.json(
    {
      status: "queued",
      queued: true,
      queuedAt: request.requestedAt,
      symbol: sym,
      message: body.force
        ? "Requested regeneration — will run on next Cowork pass."
        : "Queued for next Cowork analysis pass.",
    },
    { status: 202 },
  );
}

/**
 * DELETE /api/stocks/analyze/[...symbol]
 *   Cancels a pending queue request (does not touch cached analyses).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { symbol: string[] } },
) {
  const sym = joinSymbol(params.symbol);
  const ok = await cancel(sym);
  return NextResponse.json({ cancelled: ok });
}
