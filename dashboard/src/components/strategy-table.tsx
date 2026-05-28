"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, X } from "lucide-react";
import {
  encodeSymbolPath,
  fmtMcap,
  fmtNum,
  fmtPct,
  fmtPrice,
  ratingLabel,
  rsiTone,
} from "@/lib/format";
import { Pill } from "@/components/pill";
import { InfoTip } from "@/components/info-tip";
import type { GlossaryTerm } from "@/lib/glossary";
import { BulkBuyModal } from "@/components/bulk-buy-modal";
import { cn } from "@/lib/utils";
import type { StockRow, StrategyKey } from "@/lib/types";

interface ColDef {
  key: string;
  label: string;
  numeric?: boolean;
  info?: GlossaryTerm;
  get: (s: StockRow) => number | string | null | undefined;
  render?: (s: StockRow) => React.ReactNode;
}

const baseCols = (): Record<string, ColDef> => ({
  ticker: {
    key: "ticker",
    label: "Ticker",
    get: (s) => s.symbol,
    render: (s) => (
      <Link
        href={`/stocks/${encodeSymbolPath(s.symbol)}`}
        className="font-semibold text-signal-blue hover:underline"
      >
        {s.symbol}
      </Link>
    ),
  },
  name: {
    key: "name",
    label: "Company",
    get: (s) => s.name,
    render: (s) => (
      <span className="block max-w-[280px] truncate" title={s.name}>
        {s.name}
      </span>
    ),
  },
  sector: {
    key: "sector",
    label: "Sector",
    get: (s) => s.sector,
    render: (s) => (
      <span className="text-xs text-ink-dim">{s.sector ?? "—"}</span>
    ),
  },
  price: {
    key: "price",
    label: "Price",
    info: "price",
    numeric: true,
    get: (s) => s.close,
    render: (s) => fmtPrice(s.close),
  },
  change: {
    key: "change",
    label: "Day %",
    info: "day_change",
    numeric: true,
    get: (s) => s.change,
    render: (s) => (
      <span
        className={cn(
          "font-semibold",
          (s.change ?? 0) >= 0 ? "text-signal-green" : "text-signal-red",
        )}
      >
        {fmtPct(s.change)}
      </span>
    ),
  },
  mcap: {
    key: "mcap",
    label: "Mkt Cap",
    info: "market_cap",
    numeric: true,
    get: (s) => s.marketCap,
    render: (s) => fmtMcap(s.marketCap),
  },
  rsi: {
    key: "rsi",
    label: "RSI(14)",
    info: "rsi",
    numeric: true,
    get: (s) => s.rsi,
    render: (s) => {
      if (s.rsi === null || s.rsi === undefined) return "—";
      return <Pill tone={rsiTone(s.rsi)}>{s.rsi.toFixed(1)}</Pill>;
    },
  },
  rating: {
    key: "rating",
    label: "TV Rating",
    info: "tv_rating",
    numeric: true,
    get: (s) => s.ratingAll,
    render: (s) => {
      const r = ratingLabel(s.ratingAll);
      if (!r) return "—";
      return (
        <span className="inline-flex items-center gap-1.5">
          <Pill tone={r.tone}>{r.label}</Pill>
          <span className="text-xs text-ink-dim">
            {(s.ratingAll ?? 0).toFixed(2)}
          </span>
        </span>
      );
    },
  },
  ratingMA: {
    key: "ratingMA",
    label: "MA Rating",
    info: "tv_rating_ma",
    numeric: true,
    get: (s) => s.ratingMA,
    render: (s) => {
      const r = ratingLabel(s.ratingMA);
      return r ? <Pill tone={r.tone}>{r.label}</Pill> : "—";
    },
  },
  ratingOsc: {
    key: "ratingOsc",
    label: "Osc Rating",
    info: "tv_rating_osc",
    numeric: true,
    get: (s) => s.ratingOsc,
    render: (s) => {
      const r = ratingLabel(s.ratingOsc);
      return r ? <Pill tone={r.tone}>{r.label}</Pill> : "—";
    },
  },
  stochK: {
    key: "stochK",
    label: "Stoch %K",
    info: "stoch_k",
    numeric: true,
    get: (s) => s.stochK,
    render: (s) => fmtNum(s.stochK, 1),
  },
  volRatio: {
    key: "volRatio",
    label: "Vol vs 10d",
    info: "vol_ratio",
    numeric: true,
    get: (s) => s.volRatio,
    render: (s) =>
      s.volRatio ? (
        <span
          className={cn(
            "tabular",
            s.volRatio >= 1.5 ? "text-signal-green" : "text-ink",
          )}
        >
          {s.volRatio.toFixed(2)}×
        </span>
      ) : (
        "—"
      ),
  },
  emaGap: {
    key: "emaGap",
    label: "% above EMA20",
    info: "ema_gap",
    numeric: true,
    get: (s) => s.emaGapPct,
    render: (s) => fmtPct(s.emaGapPct, 2),
  },
  macd: {
    key: "macd",
    label: "MACD",
    info: "macd",
    numeric: true,
    get: (s) => s.macd,
    render: (s) => fmtNum(s.macd, 3),
  },
  macdSig: {
    key: "macdSig",
    label: "Signal",
    info: "macd_signal",
    numeric: true,
    get: (s) => s.macdSignal,
    render: (s) => fmtNum(s.macdSignal, 3),
  },
  macdSpread: {
    key: "macdSpread",
    label: "Spread",
    info: "macd_spread",
    numeric: true,
    get: (s) => s.macdSpread,
    render: (s) => (
      <span className="font-semibold text-signal-green">
        +{fmtNum(s.macdSpread, 4)}
      </span>
    ),
  },
  pctFrom52wLow: {
    key: "pctFrom52wLow",
    label: "Δ from 52w low",
    info: "pct_from_low52w",
    numeric: true,
    get: (s) => s.pctFrom52wLow,
    render: (s) =>
      s.pctFrom52wLow ? (
        <span className="text-ink">+{s.pctFrom52wLow.toFixed(1)}%</span>
      ) : (
        "—"
      ),
  },
  pctFrom52wHigh: {
    key: "pctFrom52wHigh",
    label: "Δ from 52w high",
    info: "pct_from_high52w",
    numeric: true,
    get: (s) => s.pctFrom52wHigh,
    render: (s) =>
      s.pctFrom52wHigh !== null && s.pctFrom52wHigh !== undefined ? (
        <span className="text-ink">{s.pctFrom52wHigh.toFixed(1)}%</span>
      ) : (
        "—"
      ),
  },
  ratingWeekly: {
    key: "ratingWeekly",
    label: "Weekly Rating",
    numeric: true,
    get: (s) => s.ratingAll1W,
    render: (s) => {
      const r = ratingLabel(s.ratingAll1W);
      if (!r) return "—";
      return (
        <span className="inline-flex items-center gap-1.5">
          <Pill tone={r.tone}>{r.label}</Pill>
          <span className="text-xs text-ink-dim">
            {(s.ratingAll1W ?? 0).toFixed(2)}
          </span>
        </span>
      );
    },
  },
});

const STRATEGY_COLS: Record<StrategyKey, string[]> = {
  strong_buy: ["ticker", "name", "sector", "price", "change", "rating", "ratingMA", "ratingOsc", "rsi", "mcap"],
  oversold:   ["ticker", "name", "sector", "price", "change", "rsi", "stochK", "pctFrom52wLow", "mcap"],
  breakout:   ["ticker", "name", "sector", "price", "change", "volRatio", "emaGap", "rsi", "mcap"],
  macd_cross: ["ticker", "name", "sector", "price", "change", "macd", "macdSig", "macdSpread", "rsi", "mcap"],
  quality_oversold: ["ticker", "name", "sector", "price", "change", "rsi", "stochK", "rating", "pctFrom52wLow", "mcap"],
  near_high:  ["ticker", "name", "sector", "price", "change", "pctFrom52wHigh", "volRatio", "rsi", "mcap"],
  mtf_buy:    ["ticker", "name", "sector", "price", "change", "rating", "ratingWeekly", "rsi", "mcap"],
};

export function StrategyTable({
  strategy,
  rows,
}: {
  strategy: StrategyKey;
  rows: StockRow[];
}) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Reset selection on strategy or row-set change
  useEffect(() => {
    setSelected(new Set());
  }, [strategy, rows]);

  const cols = useMemo(() => {
    const all = baseCols();
    return STRATEGY_COLS[strategy].map((k) => all[k]).filter(Boolean);
  }, [strategy]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let out = rows;
    if (f) {
      out = out.filter(
        (s) =>
          s.symbol.toLowerCase().includes(f) ||
          s.name.toLowerCase().includes(f) ||
          (s.sector ?? "").toLowerCase().includes(f),
      );
    }
    if (sortKey) {
      const col = cols.find((c) => c.key === sortKey);
      if (col) {
        const dir = sortAsc ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = col.get(a);
          const bv = col.get(b);
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          if (typeof av === "number" && typeof bv === "number")
            return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }
    }
    return out;
  }, [rows, filter, sortKey, sortAsc, cols]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.symbol));
  const someVisibleSelected =
    !allVisibleSelected && filtered.some((s) => selected.has(s.symbol));

  const toggleRow = (sym: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const s of filtered) next.delete(s.symbol);
      } else {
        for (const s of filtered) next.add(s.symbol);
      }
      return next;
    });
  };

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.symbol)),
    [rows, selected],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-edge bg-bg-elev p-10 text-center text-ink-dim">
        No stocks match this strategy right now. Try the Refresh button — or
        check back later in the trading day.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by ticker, name, sector..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-72 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm placeholder:text-ink-dim focus:border-signal-accent focus:outline-none"
        />
        <span className="text-xs text-ink-dim">
          Showing {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-edge">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev">
            <tr>
              <th className="w-10 border-b border-edge px-3 py-2.5 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  className="h-3.5 w-3.5 cursor-pointer accent-signal-accent"
                  aria-label="Select all visible"
                />
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => {
                    if (sortKey === c.key) setSortAsc(!sortAsc);
                    else {
                      setSortKey(c.key);
                      setSortAsc(false);
                    }
                  }}
                  className={cn(
                    "cursor-pointer select-none border-b border-edge px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim transition-colors hover:text-ink",
                    c.numeric ? "text-right" : "text-left",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.info && (
                      <span className="font-normal normal-case tracking-normal">
                        <InfoTip term={c.info} />
                      </span>
                    )}
                  </span>
                  {sortKey === c.key && (
                    <span className="ml-1 text-signal-accent">
                      {sortAsc ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isSelected = selected.has(s.symbol);
              return (
                <tr
                  key={s.tvTicker}
                  className={cn(
                    "border-b border-edge/60 transition-colors",
                    isSelected
                      ? "bg-signal-accent/10 hover:bg-signal-accent/15"
                      : "hover:bg-bg-elev/60",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(s.symbol)}
                      className="h-3.5 w-3.5 cursor-pointer accent-signal-accent"
                      aria-label={`Select ${s.symbol}`}
                    />
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-2.5 whitespace-nowrap",
                        c.numeric ? "text-right tabular" : "",
                      )}
                    >
                      {c.render ? c.render(s) : (c.get(s) ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating selection bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-edge bg-bg-elev2/95 px-2 py-2 pl-4 shadow-2xl backdrop-blur">
            <span className="text-sm font-semibold tabular">
              <span className="text-signal-accent">{selected.size}</span>{" "}
              selected
            </span>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-full p-1.5 text-ink-dim hover:bg-bg-elev hover:text-ink"
              aria-label="Clear selection"
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="h-5 w-px bg-edge" />
            <button
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-signal-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-signal-accent/90"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Add to simulation
            </button>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkBuyModal
          selected={selectedRows}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
