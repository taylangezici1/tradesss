"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SimSummary } from "@/lib/types-sim";

export function SimulationsList() {
  const [sims, setSims] = useState<SimSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulations", { cache: "no-store" });
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
          <h1 className="text-2xl font-semibold tracking-tight">Simulations</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Paper-trading portfolios. Each runs independently with its own cash,
            positions, and P/L.
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
            href="/simulations/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90"
          >
            <Plus className="h-3.5 w-3.5" /> New simulation
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
          <Wallet className="mx-auto h-8 w-8 text-ink-dim" />
          <div className="mt-3 text-sm text-ink-dim">
            No simulations yet. Create your first one to start paper trading.
          </div>
          <Link
            href="/simulations/new"
            className="mt-4 inline-block rounded-md bg-signal-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-signal-accent/90"
          >
            Create simulation →
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
                href={`/simulations/${s.id}`}
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
                  Started {new Date(s.createdAt).toLocaleDateString()} · from{" "}
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
