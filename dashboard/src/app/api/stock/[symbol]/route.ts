import { NextResponse } from "next/server";
import { resolveTicker } from "@/lib/tradingview";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { symbol: string } },
) {
  const sym = decodeURIComponent(params.symbol);
  try {
    const stock = await resolveTicker(sym);
    if (!stock) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(stock);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch", detail: message },
      { status: 502 },
    );
  }
}
