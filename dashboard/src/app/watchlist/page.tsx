import type { Metadata } from "next";
import { WatchlistView } from "@/components/watchlist-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return <WatchlistView />;
}
