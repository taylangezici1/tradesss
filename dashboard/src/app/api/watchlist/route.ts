import { NextResponse } from "next/server";
import {
  addToWatchlist,
  readWatchlist,
  removeFromWatchlist,
  type WatchlistEntry,
} from "@/lib/watchlist-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await readWatchlist();
  return NextResponse.json({ entries: list });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<WatchlistEntry>;
  if (!body.symbol || !body.tvTicker) {
    return NextResponse.json(
      { error: "symbol and tvTicker are required" },
      { status: 400 },
    );
  }
  const entry: WatchlistEntry = {
    symbol: body.symbol,
    tvTicker: body.tvTicker,
    name: body.name ?? body.symbol,
    note: body.note,
    addedAt: new Date().toISOString(),
  };
  const list = await addToWatchlist(entry);
  return NextResponse.json({ entries: list });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json(
      { error: "symbol query param required" },
      { status: 400 },
    );
  }
  const list = await removeFromWatchlist(symbol);
  return NextResponse.json({ entries: list });
}
