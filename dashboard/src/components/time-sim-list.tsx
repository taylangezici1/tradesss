"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Clock,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SimSummary } from "@/lib/types-sim";

interface TimeSimSummary extends SimSummary {
  startDate?: string;
}

export function TimeSimList() {
  const [sims, setSims] = useState<TimeSimSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timesims", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setSims(j.simulations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-md bg-signal-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-blue">
            <Clock className="h-3 w-3" /> Time-aware
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Time Simulations
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-dim">
            Run historical &quot;what-if&quot; portfolios with trades on
            specific past dates. Each simulation values open positions using
            the close on an as-of date you can scrub through time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium hover:border-signal-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <Link
            href="/time-sim/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90"
          >
            <Plus className="h-3.5 w-3.5" /> New time sim
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-4 text-sm text-signal-red">
          {error}
        </div>
      )}

      {sims.length === 0 && !loading && !error && (
        <div className="rounded-lg border border-dashed border-edge bg-bg-elev p-10 text-center">
          <Clock className="mx-auto h-8 w-8 text-ink-dim" />
          <div className="mt-3 text-sm text-ink-dim">
            No time simulations yet. Create one to backtest specific dated
            buys & sells.
          </div>
          <Link
            href="/time-sim/new"
            className="mt-4 inline-block rounded-md bg-signal-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-signal-accent/90"
          >
            Create time simulation →
          </Link>
        </div>
      )}

      {sims.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sims.map((s) => {
            const up = s.totalPnl >= 0;
            return (
              <Link
                key={s.id}
                href={`/time-sim/${s.id}`}
                className="group rounded-lg border border-edge bg-bg-elev p-4 transition-colors hover:border-signal-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">
                      {s.name}
                    </div>
                    {s.description && (
                      <div className="mt-0.5 truncate text-xs text-ink-dim">
                        {s.description}
                      </div>
                    )}
                  </div>
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold tabular",
                      up
                        ? "bg-signal-green/15 text-signal-green"
                        : "bg-signal-red/15 text-signal-red",
                    )}
                  >
                    {up ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {fmtPct(s.totalPnlPct)}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Total Value" value={fmtPrice(s.totalValue)} />
                  <Stat
                    label="P/L"
                    value={fmtPrice(s.totalPnl)}
                    tone={up ? "green" : "red"}
                  />
                  <Stat label="Cash" value={fmtPrice(s.cash)} />
                  <Stat
                    label="Positions"
                    value={`${s.numOpenPositions} · ${s.numTrades} trades`}
                  />
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-wider text-ink-dim">
                  {s.startDate && <>Start {s.startDate} · </>}
                  Created {new Date(s.createdAt).toLocaleDateString()} · from{" "}
                  {fmtPrice(s.startingCash)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-semibold tabular",
          tone === "green" && "text-signal-green",
          tone === "red" && "text-signal-red",
        )}
      >
        {value}
      </div>
    </div>
  );
}
