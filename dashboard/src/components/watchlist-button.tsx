"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function WatchlistButton({
  symbol,
  tvTicker,
  name,
}: {
  symbol: string;
  tvTicker: string;
  name: string;
}) {
  const [inList, setInList] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/watchlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const entries: { symbol: string }[] = j.entries ?? [];
        setInList(
          entries.some(
            (e) => e.symbol.toUpperCase() === symbol.toUpperCase(),
          ),
        );
      })
      .catch(() => setInList(false));
  }, [symbol]);

  const toggle = async () => {
    if (inList === null || busy) return;
    setBusy(true);
    try {
      if (inList) {
        await fetch(
          `/api/watchlist?symbol=${encodeURIComponent(symbol)}`,
          { method: "DELETE" },
        );
        setInList(false);
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, tvTicker, name }),
        });
        setInList(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy || inList === null}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        inList
          ? "border-signal-accent bg-signal-accent/15 text-signal-accent"
          : "border-edge bg-bg-elev2 text-ink hover:border-signal-accent",
      )}
    >
      {inList ? (
        <BookmarkCheck className="h-3.5 w-3.5" />
      ) : (
        <Bookmark className="h-3.5 w-3.5" />
      )}
      {inList ? "In watchlist" : "Add to watchlist"}
    </button>
  );
}
