import { NextResponse } from "next/server";
import { listRequests } from "@/lib/analysis-queue";
import { syncFromFiles } from "@/lib/analysis-store";

export const dynamic = "force-dynamic";

export async function GET() {
  // Drain any results the sandboxed scheduled task left as JSON files. This
  // also clears the matching queue rows, so the queue count we return below
  // is correct right after a scheduled run.
  await syncFromFiles();
  const requests = await listRequests();
  return NextResponse.json({
    count: requests.length,
    requests: requests.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      requestedAt: r.requestedAt,
    })),
  });
}
