"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Check, AlertCircle } from "lucide-react";
import { fmtPrice, fmtShares } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SimSummary } from "@/lib/types-sim";
import type { StockRow } from "@/lib/types";

interface Props {
  selected: StockRow[];
  onClose: () => void;
  onDone: () => void;
}

type TradeStatus =
  | { state: "pending" }
  | { state: "running" }
  | { state: "ok"; shares: number; price: number }
  | { state: "error"; message: string };

export function BulkBuyModal({ selected, onClose, onDone }: Props) {
  const [sims, setSims] = useState<SimSummary[] | null>(null);
  const [simId, setSimId] = useState<string>("");
  const [allocationPct, setAllocationPct] = useState("100"); // % of cash to deploy
  const [status, setStatus] = useState<Record<string, TradeStatus>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/simulations", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list: SimSummary[] = j.simulations ?? [];
        setSims(list);
        if (list[0]) setSimId(list[0].id);
      })
      .catch(() => setSims([]));
  }, []);

  const sim = sims?.find((s) => s.id === simId) ?? null;
  const N = selected.length;

  // Allocation math
  const plan = useMemo(() => {
    if (!sim || N === 0) return null;
    const pct = Math.max(0, Math.min(100, Number(allocationPct) || 0));
    const cashToDeploy = (sim.cash * pct) / 100;
    const commissionPerTrade = sim.commissionPerTrade ?? 0;
    const totalCommission = N * commissionPerTrade;
    const usable = cashToDeploy - totalCommission;
    const perStock = usable / N;
    return {
      cashToDeploy,
      commissionPerTrade,
      totalCommission,
      perStock,
      usable,
      cashAfter: sim.cash - cashToDeploy,
      invalid: usable <= 0 || perStock <= 0,
    };
  }, [sim, N, allocationPct]);

  const runBulkBuy = async () => {
    if (!sim || !plan || plan.invalid) return;
    setError(null);
    setRunning(true);
    setStatus(
      Object.fromEntries(
        selected.map((s) => [s.symbol, { state: "pending" } as TradeStatus]),
      ),
    );

    // Run serially so the cash check in the engine sees up-to-date balance
    for (const stock of selected) {
      setStatus((prev) => ({
        ...prev,
        [stock.symbol]: { state: "running" },
      }));
      try {
        const res = await fetch(`/api/simulations/${sim.id}/trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: stock.symbol,
            tvTicker: stock.tvTicker,
            side: "BUY",
            dollars: plan.perStock,
            note: "Bulk buy from scanner",
          }),
        });
        const j = await res.json();
        if (!res.ok) {
          setStatus((prev) => ({
            ...prev,
            [stock.symbol]: {
              state: "error",
              message: j.error ?? "Failed",
            },
          }));
        } else {
          setStatus((prev) => ({
            ...prev,
            [stock.symbol]: {
              state: "ok",
              shares: j.trade.shares,
              price: j.trade.price,
            },
          }));
        }
      } catch (e) {
        setStatus((prev) => ({
          ...prev,
          [stock.symbol]: {
            state: "error",
            message: e instanceof Error ? e.message : "Unknown error",
          },
        }));
      }
    }
    setRunning(false);
  };

  const allDone =
    selected.length > 0 &&
    selected.every(
      (s) =>
        status[s.symbol]?.state === "ok" ||
        status[s.symbol]?.state === "error",
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !running && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-edge bg-bg-elev p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              Bulk buy {N} stock{N !== 1 ? "s" : ""}
            </h3>
            <p className="mt-0.5 text-xs text-ink-dim">
              Divide the simulation&apos;s cash equally across selected
              tickers, net of commissions.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-ink-dim hover:text-ink disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {sims === null ? (
          <div className="mt-6 text-center text-sm text-ink-dim">
            Loading simulations...
          </div>
        ) : sims.length === 0 ? (
          <div className="mt-6 rounded-md border border-dashed border-edge bg-bg-elev2 p-4 text-center">
            <div className="text-sm text-ink-dim">
              No simulations yet — create one to bulk-buy.
            </div>
            <Link
              href="/simulations/new"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90"
            >
              <Plus className="h-3.5 w-3.5" /> Create simulation
            </Link>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-dim">
                  Simulation
                </label>
                <select
                  value={simId}
                  onChange={(e) => setSimId(e.target.value)}
                  disabled={running}
                  className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
                >
                  {sims.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {fmtPrice(s.cash)} cash
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-dim">
                  Deploy % of cash
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={allocationPct}
                    onChange={(e) => setAllocationPct(e.target.value)}
                    disabled={running}
                    className="w-full rounded-md border border-edge bg-bg-elev2 py-2 pl-3 pr-10 text-sm focus:border-signal-accent focus:outline-none"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-dim">
                    %
                  </span>
                </div>
              </div>
            </div>

            {plan && (
              <div className="rounded-md border border-edge bg-bg-elev2 p-3 text-xs">
                <div className="grid grid-cols-2 gap-y-1.5">
                  <span className="text-ink-dim">Cash to deploy</span>
                  <span className="text-right font-semibold tabular">
                    {fmtPrice(plan.cashToDeploy)}
                  </span>
                  <span className="text-ink-dim">
                    Commissions ({N} × {fmtPrice(plan.commissionPerTrade)})
                  </span>
                  <span className="text-right tabular text-ink-dim">
                    -{fmtPrice(plan.totalCommission)}
                  </span>
                  <span className="text-ink-dim">Usable for shares</span>
                  <span className="text-right tabular">
                    {fmtPrice(plan.usable)}
                  </span>
                  <span className="font-semibold">Per stock</span>
                  <span className="text-right font-semibold tabular text-signal-accent">
                    {fmtPrice(plan.perStock)}
                  </span>
                  <span className="text-ink-dim">Cash remaining after</span>
                  <span className="text-right tabular text-ink-dim">
                    {fmtPrice(plan.cashAfter)}
                  </span>
                </div>
                {plan.invalid && (
                  <div className="mt-2 flex items-center gap-1.5 text-signal-red">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not enough cash to cover commissions across {N} trades.
                  </div>
                )}
              </div>
            )}

            {/* Selected stocks */}
            <div className="max-h-72 overflow-y-auto rounded-md border border-edge">
              <table className="w-full text-sm">
                <thead className="bg-bg-elev2 sticky top-0">
                  <tr className="text-left">
                    <Th>Ticker</Th>
                    <Th align="right">Price</Th>
                    <Th align="right">Est. shares</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((s) => {
                    const st = status[s.symbol];
                    const estShares =
                      plan && s.close ? plan.perStock / s.close : 0;
                    return (
                      <tr
                        key={s.symbol}
                        className="border-b border-edge/60 last:border-b-0"
                      >
                        <td className="px-3 py-2">
                          <div className="font-semibold text-signal-blue">
                            {s.symbol}
                          </div>
                          <div className="max-w-[200px] truncate text-[11px] text-ink-dim">
                            {s.name}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular">
                          {s.close ? fmtPrice(s.close) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular text-ink-dim">
                          {st?.state === "ok"
                            ? fmtShares(st.shares)
                            : fmtShares(estShares)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <StatusBadge status={st} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => (allDone ? onDone() : onClose())}
                disabled={running}
                className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm hover:border-signal-accent disabled:opacity-50"
              >
                {allDone ? "Close" : "Cancel"}
              </button>
              {!allDone && (
                <button
                  type="button"
                  onClick={runBulkBuy}
                  disabled={running || !plan || plan.invalid}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md bg-signal-green px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-green/90 disabled:opacity-50",
                  )}
                >
                  {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {running ? "Executing..." : `Buy ${N} at market`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: TradeStatus }) {
  if (!status) return <span className="text-xs text-ink-dim">—</span>;
  if (status.state === "pending")
    return <span className="text-xs text-ink-dim">waiting</span>;
  if (status.state === "running")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-signal-accent">
        <Loader2 className="h-3 w-3 animate-spin" />
        placing
      </span>
    );
  if (status.state === "ok")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-signal-green">
        <Check className="h-3 w-3" />
        bought {fmtShares(status.shares)} @ {fmtPrice(status.price)}
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-signal-red"
      title={status.message}
    >
      <AlertCircle className="h-3 w-3" />
      {status.message.slice(0, 30)}
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
