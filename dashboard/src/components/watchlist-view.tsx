"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Trash2, RefreshCw, BookmarkCheck } from "lucide-react";
import { Pill } from "@/components/pill";
import { InfoTip } from "@/components/info-tip";
import type { GlossaryTerm } from "@/lib/glossary";
import {
  encodeSymbolPath,
  fmtMcap,
  fmtPct,
  fmtPrice,
  ratingLabel,
  rsiTone,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StockRow } from "@/lib/types";
import type { WatchlistEntry } from "@/lib/watchlist-store";

interface Enriched {
  entry: WatchlistEntry;
  data: StockRow | null;
  error?: string;
}

export function WatchlistView() {
  const [rows, setRows] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      const j = (await res.json()) as { entries: WatchlistEntry[] };
      const entries = j.entries ?? [];

      // Fetch fresh data for each ticker in parallel
      const enriched: Enriched[] = await Promise.all(
        entries.map(async (entry) => {
          try {
            const r = await fetch(
              `/api/stock/${encodeURIComponent(entry.symbol)}`,
              { cache: "no-store" },
            );
            if (!r.ok) {
              const j = await r.json();
              return { entry, data: null, error: j.detail ?? j.error };
            }
            const data = (await r.json()) as StockRow;
            return { entry, data };
          } catch (e) {
            return {
              entry,
              data: null,
              error: e instanceof Error ? e.message : "Failed",
            };
          }
        }),
      );
      setRows(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (symbol: string) => {
    await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, {
      method: "DELETE",
    });
    setRows((prev) => prev.filter((r) => r.entry.symbol !== symbol));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Stocks you&apos;re tracking — live quote, rating, and signal status.
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium text-ink hover:border-signal-accent disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {rows.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-edge bg-bg-elev p-10 text-center">
          <BookmarkCheck className="mx-auto h-8 w-8 text-ink-dim" />
          <div className="mt-3 text-sm text-ink-dim">
            Your watchlist is empty. Open any stock and click{" "}
            <span className="font-semibold text-ink">Add to watchlist</span> to
            track it here.
          </div>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md border border-edge bg-bg-elev2 px-4 py-1.5 text-sm font-medium text-ink hover:border-signal-accent"
          >
            Browse the scanner →
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="w-full text-sm">
            <thead className="bg-bg-elev">
              <tr className="text-left">
                <Th>Ticker</Th>
                <Th>Company</Th>
                <Th align="right" info="price">Price</Th>
                <Th align="right" info="day_change">Day %</Th>
                <Th align="right" info="rsi">RSI</Th>
                <Th info="tv_rating">TV Rating</Th>
                <Th align="right" info="market_cap">Mkt Cap</Th>
                <Th align="right">Added</Th>
                <Th align="right">&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, data, error }) => {
                const r = ratingLabel(data?.ratingAll);
                return (
                  <tr
                    key={entry.symbol}
                    className="border-b border-edge/60 hover:bg-bg-elev/60"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/stocks/${encodeSymbolPath(entry.symbol)}`}
                        className="font-semibold text-signal-blue hover:underline"
                      >
                        {entry.symbol}
                      </Link>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2.5">
                      {data?.name ?? entry.name}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {fmtPrice(data?.close)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {data?.change !== undefined && data?.change !== null ? (
                        <span
                          className={
                            (data.change ?? 0) >= 0
                              ? "font-semibold text-signal-green"
                              : "font-semibold text-signal-red"
                          }
                        >
                          {fmtPct(data.change)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {data?.rsi !== null && data?.rsi !== undefined ? (
                        <Pill tone={rsiTone(data.rsi)}>
                          {data.rsi.toFixed(1)}
                        </Pill>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {r ? <Pill tone={r.tone}>{r.label}</Pill> : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {fmtMcap(data?.marketCap)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-ink-dim">
                      {new Date(entry.addedAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {error ? (
                        <span title={error} className="text-xs text-signal-red">
                          err
                        </span>
                      ) : null}
                      <button
                        onClick={() => remove(entry.symbol)}
                        className="ml-2 rounded p-1 text-ink-dim hover:bg-signal-red/15 hover:text-signal-red"
                        aria-label={`Remove ${entry.symbol}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
  info,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  info?: GlossaryTerm;
}) {
  return (
    <th
      className={cn(
        "border-b border-edge px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {children}
        {info && (
          <span className="font-normal normal-case tracking-normal">
            <InfoTip term={info} />
          </span>
        )}
      </span>
    </th>
  );
}
