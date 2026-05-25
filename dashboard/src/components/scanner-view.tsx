"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Star, ArrowDown, ArrowUp, GitCompareArrows } from "lucide-react";
import { StrategyTable } from "@/components/strategy-table";
import { cn } from "@/lib/utils";
import type { ScanResult, StrategyKey } from "@/lib/types";
import { STRATEGY_DESC, STRATEGY_LABELS } from "@/lib/types";

const TAB_ICON: Record<StrategyKey, React.ReactNode> = {
  strong_buy: <Star className="h-3.5 w-3.5" />,
  oversold: <ArrowDown className="h-3.5 w-3.5" />,
  breakout: <ArrowUp className="h-3.5 w-3.5" />,
  macd_cross: <GitCompareArrows className="h-3.5 w-3.5" />,
};

interface ApiError {
  error: string;
  detail?: string;
}

export function ScannerView() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<StrategyKey>("strong_buy");

  const load = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan${force ? "?force=1" : ""}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j as ApiError);
        setData(null);
      } else {
        setData(j as ScanResult);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError({ error: "Network error", detail: message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            S&amp;P 500 Scanner
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            Live technicals from TradingView&apos;s public scanner endpoint —
            classified into four buy strategies.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-dim">
          {data && (
            <span>
              <span className="text-ink">{data.universeSize}</span> stocks ·
              updated{" "}
              <span className="text-ink">
                {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium text-ink hover:border-signal-accent disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-4 text-sm">
          <div className="font-semibold text-signal-red">{error.error}</div>
          {error.detail && (
            <div className="mt-1 text-xs text-ink-dim">{error.detail}</div>
          )}
          <div className="mt-3 text-xs text-ink-dim">
            Most common cause: your network can&apos;t reach{" "}
            <code className="text-ink">scanner.tradingview.com</code>. Try
            disabling a VPN or proxy, then click Refresh.
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-edge">
        {(Object.keys(STRATEGY_LABELS) as StrategyKey[]).map((key) => {
          const count = data?.strategies[key].length ?? 0;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                active === key
                  ? "border-signal-accent text-ink"
                  : "border-transparent text-ink-dim hover:text-ink",
              )}
            >
              {TAB_ICON[key]}
              <span>{STRATEGY_LABELS[key]}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  active === key
                    ? "bg-signal-accent text-white"
                    : "bg-bg-elev2 text-ink-dim",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-ink-dim">
        {STRATEGY_DESC[active]}
      </p>

      {data ? (
        <StrategyTable strategy={active} rows={data.strategies[active]} />
      ) : !error ? (
        <div className="rounded-lg border border-edge bg-bg-elev p-10 text-center text-sm text-ink-dim">
          Loading scanner data...
        </div>
      ) : null}
    </div>
  );
}
