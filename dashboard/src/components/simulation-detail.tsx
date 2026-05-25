"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { encodeSymbolPath, fmtPct, fmtPrice, fmtShares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EquityCurveChart } from "@/components/equity-curve";
import { InfoTip } from "@/components/info-tip";
import type { GlossaryTerm } from "@/lib/glossary";
import type {
  EquityCurve,
  Position,
  SimDetail,
  Trade,
} from "@/lib/types-sim";

export function SimulationDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<SimDetail | null>(null);
  const [curve, setCurve] = useState<EquityCurve | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSell, setShowSell] = useState<Position | null>(null);
  const [copying, setCopying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [simRes, curveRes] = await Promise.all([
        fetch(`/api/simulations/${id}`, { cache: "no-store" }),
        fetch(`/api/simulations/${id}/equity`, { cache: "no-store" }),
      ]);
      const simJ = await simRes.json();
      if (!simRes.ok) throw new Error(simJ.error ?? "Failed");
      setData(simJ);
      if (curveRes.ok) setCurve(await curveRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const deleteSim = async () => {
    if (!confirm(`Delete simulation "${data?.name}"? This cannot be undone.`))
      return;
    await fetch(`/api/simulations/${id}`, { method: "DELETE" });
    router.push("/simulations");
  };

  const [showCopyModal, setShowCopyModal] = useState(false);

  const submitCopy = async (name: string, startDate: string) => {
    setCopying(true);
    try {
      const res = await fetch("/api/timesims/copy-from-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simId: id, name, startDate }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      router.push(`/time-sim/${j.simulation.id}`);
    } catch (e) {
      alert(
        "Failed to copy: " + (e instanceof Error ? e.message : "unknown"),
      );
    } finally {
      setCopying(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-12 text-center text-sm text-ink-dim">Loading...</div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/simulations"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to simulations
        </Link>
        <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-4 text-sm text-signal-red">
          {error ?? "Not found"}
        </div>
      </div>
    );
  }

  const up = data.totalPnl >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/simulations"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to simulations
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCopyModal(true)}
            disabled={copying}
            title="Clone this simulation into a new Time Sim where you can scrub the as-of date"
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium hover:border-signal-blue hover:text-signal-blue disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5" />
            {copying ? "Copying..." : "Copy to Time Sim"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium hover:border-signal-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={deleteSim}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium text-ink-dim hover:border-signal-red hover:text-signal-red"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
        {data.description && (
          <p className="mt-1 text-sm text-ink-dim">{data.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-dim">
          <span>Started {new Date(data.createdAt).toLocaleDateString()}</span>
          <span>· {fmtPrice(data.startingCash)} starting cash</span>
          {data.config.commissionPerTrade > 0 && (
            <span>· ${data.config.commissionPerTrade}/trade commission</span>
          )}
          {data.config.slippageBps > 0 && (
            <span>· {data.config.slippageBps}bps slippage</span>
          )}
          {data.config.maxPositionPct && (
            <span>· max {data.config.maxPositionPct}% per position</span>
          )}
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatBlock label="Total Value" infoTerm="total_value" value={fmtPrice(data.totalValue)} />
        <StatBlock
          label="P/L"
          infoTerm="unrealized_pnl"
          value={
            <span className="inline-flex items-center gap-1.5">
              {up ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
              {fmtPrice(data.totalPnl)}
            </span>
          }
          hint={`${fmtPct(data.totalPnlPct)} from start`}
          tone={up ? "green" : "red"}
        />
        <StatBlock label="Cash" infoTerm="starting_cash" value={fmtPrice(data.cash)} />
        <StatBlock
          label="Realized P/L"
          infoTerm="realized_pnl"
          value={fmtPrice(data.realizedPnl)}
          tone={data.realizedPnl >= 0 ? "green" : "red"}
        />
        <StatBlock
          label="Unrealized P/L"
          infoTerm="unrealized_pnl"
          value={fmtPrice(data.unrealizedPnl)}
          tone={data.unrealizedPnl >= 0 ? "green" : "red"}
        />
      </div>

      {/* Equity curve */}
      <div>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-ink-dim">
          <span>Equity curve</span>
          {curve && (
            <>
              <span className="font-normal normal-case text-[11px]">
                · max drawdown {curve.maxDrawdownPct.toFixed(2)}%
              </span>
              <InfoTip term="max_drawdown" />
            </>
          )}
        </h2>
        {curve ? (
          <EquityCurveChart
            curve={curve}
            startingCash={data.startingCash}
            height={240}
          />
        ) : (
          <div className="rounded-lg border border-edge bg-bg-elev p-6 text-center text-sm text-ink-dim">
            Loading historical prices...
          </div>
        )}
      </div>

      {/* Positions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-dim">
          Open positions
        </h2>
        {data.positions.length === 0 ? (
          <div className="rounded-lg border border-edge bg-bg-elev p-6 text-center text-sm text-ink-dim">
            No open positions. Go to any stock page and click <strong>Trade</strong> to buy.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-sm">
              <thead className="bg-bg-elev">
                <tr>
                  <Th>Symbol</Th>
                  <Th align="right" info="shares">Shares</Th>
                  <Th align="right" info="avg_cost">Avg Cost</Th>
                  <Th align="right" info="cost_basis">Cost Basis</Th>
                  <Th align="right" info="price">Current</Th>
                  <Th align="right" info="market_value">Mkt Value</Th>
                  <Th align="right" info="unrealized_pnl">Unrealized P/L</Th>
                  <Th align="right" info="day_change">Day %</Th>
                  <Th align="right">&nbsp;</Th>
                </tr>
              </thead>
              <tbody>
                {data.positions.map((p) => {
                  const pnlUp = (p.unrealizedPnl ?? 0) >= 0;
                  return (
                    <tr
                      key={p.symbol}
                      className="border-b border-edge/60 hover:bg-bg-elev/60"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/stocks/${encodeSymbolPath(p.symbol)}`}
                          className="font-semibold text-signal-blue hover:underline"
                        >
                          {p.symbol}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {fmtShares(p.shares)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {fmtPrice(p.avgCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {fmtPrice(p.costBasis)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {p.currentPrice ? fmtPrice(p.currentPrice) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {fmtPrice(p.marketValue ?? 0)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-semibold tabular",
                          pnlUp ? "text-signal-green" : "text-signal-red",
                        )}
                      >
                        {fmtPrice(p.unrealizedPnl ?? 0)}
                        <div className="text-[10px] font-normal">
                          {fmtPct(p.unrealizedPnlPct)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {p.dayChangePct !== null && p.dayChangePct !== undefined ? (
                          <span
                            className={
                              p.dayChangePct >= 0
                                ? "text-signal-green"
                                : "text-signal-red"
                            }
                          >
                            {fmtPct(p.dayChangePct)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => setShowSell(p)}
                          className="rounded-md border border-edge bg-bg-elev2 px-2.5 py-1 text-xs font-medium hover:border-signal-accent"
                        >
                          Sell
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

      {/* Trade history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-dim">
          Trade history ({data.trades.length})
        </h2>
        {data.trades.length === 0 ? (
          <div className="rounded-lg border border-edge bg-bg-elev p-6 text-center text-sm text-ink-dim">
            No trades yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-sm">
              <thead className="bg-bg-elev">
                <tr>
                  <Th>Date</Th>
                  <Th>Side</Th>
                  <Th>Symbol</Th>
                  <Th align="right" info="shares">Shares</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Total</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {[...data.trades]
                  .sort(
                    (a, b) =>
                      +new Date(b.timestamp) - +new Date(a.timestamp),
                  )
                  .map((t: Trade) => (
                    <tr
                      key={t.id}
                      className="border-b border-edge/60 hover:bg-bg-elev/60"
                    >
                      <td className="px-3 py-2 text-xs text-ink-dim">
                        {new Date(t.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-[11px] font-semibold",
                            t.side === "BUY"
                              ? "bg-signal-green/15 text-signal-green"
                              : "bg-signal-red/15 text-signal-red",
                          )}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-signal-blue">
                        <Link
                          href={`/stocks/${encodeSymbolPath(t.symbol)}`}
                          className="hover:underline"
                        >
                          {t.symbol}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {fmtShares(t.shares)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {fmtPrice(t.price)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {fmtPrice(t.shares * t.price)}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-dim">
                        {t.note ?? ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sell modal */}
      {showSell && (
        <SellModal
          simId={data.id}
          position={showSell}
          onClose={() => setShowSell(null)}
          onSold={() => {
            setShowSell(null);
            load();
          }}
        />
      )}

      {/* Copy-to-time-sim modal */}
      {showCopyModal && (
        <CopyToTimeSimModal
          defaultName={`${data.name} (time copy)`}
          earliestTradeDate={
            data.trades.length > 0
              ? [...data.trades]
                  .sort(
                    (a, b) =>
                      +new Date(a.timestamp) - +new Date(b.timestamp),
                  )[0]
                  .timestamp.slice(0, 10)
              : null
          }
          submitting={copying}
          onClose={() => setShowCopyModal(false)}
          onConfirm={(name, startDate) => {
            setShowCopyModal(false);
            submitCopy(name, startDate);
          }}
        />
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  hint,
  tone,
  infoTerm,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "green" | "red";
  infoTerm?: GlossaryTerm;
}) {
  return (
    <div className="rounded-lg border border-edge bg-bg-elev p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
        <span>{label}</span>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular",
          tone === "green" && "text-signal-green",
          tone === "red" && "text-signal-red",
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-xs text-ink-dim tabular">{hint}</div>
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
        "border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim",
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

function SellModal({
  simId,
  position,
  onClose,
  onSold,
}: {
  simId: string;
  position: Position;
  onClose: () => void;
  onSold: () => void;
}) {
  const [mode, setMode] = useState<"shares" | "dollars">("dollars");
  const [sharesInput, setSharesInput] = useState(String(position.shares));
  const [dollarsInput, setDollarsInput] = useState(
    position.currentPrice
      ? (position.shares * position.currentPrice).toFixed(2)
      : "0",
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = position.currentPrice ?? position.avgCost;
  const shares =
    mode === "shares"
      ? Math.max(0, Number(sharesInput) || 0)
      : Math.max(0, (Number(dollarsInput) || 0) / (price || 1));
  const total = shares * price;
  const overSize = shares > position.shares + 1e-9;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!(shares > 0)) {
      setError(mode === "dollars" ? "Enter an amount > $0" : "Enter shares > 0");
      return;
    }
    if (overSize) {
      setError(
        `You only hold ${fmtShares(position.shares)} shares (${fmtPrice(position.shares * price)}).`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/simulations/${simId}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: position.symbol,
          tvTicker: position.tvTicker,
          side: "SELL",
          shares,
          note: note || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onSold();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-edge bg-bg-elev p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Sell {position.symbol}</h3>
        <p className="mt-1 text-xs text-ink-dim">
          You hold {fmtShares(position.shares)} sh at avg cost{" "}
          {fmtPrice(position.avgCost)} · Current:{" "}
          {position.currentPrice ? fmtPrice(position.currentPrice) : "—"} ·
          Market value:{" "}
          {fmtPrice(position.shares * (position.currentPrice ?? 0))}
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
              Amount
            </label>
            <div className="flex rounded-md border border-edge bg-bg-elev2 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("dollars")}
                className={cn(
                  "rounded px-2 py-1",
                  mode === "dollars"
                    ? "bg-signal-accent text-white"
                    : "text-ink-dim hover:text-ink",
                )}
              >
                $ Dollars
              </button>
              <button
                type="button"
                onClick={() => setMode("shares")}
                className={cn(
                  "rounded px-2 py-1",
                  mode === "shares"
                    ? "bg-signal-accent text-white"
                    : "text-ink-dim hover:text-ink",
                )}
              >
                # Shares
              </button>
            </div>
          </div>

          {mode === "dollars" ? (
            <div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={dollarsInput}
                  onChange={(e) => setDollarsInput(e.target.value)}
                  className="w-full rounded-md border border-edge bg-bg-elev2 py-2 pl-7 pr-3 text-sm focus:border-signal-accent focus:outline-none"
                />
              </div>
              <div className="mt-2 flex gap-1.5">
                {[0.25, 0.5, 1].map((frac) => (
                  <button
                    key={frac}
                    type="button"
                    onClick={() =>
                      setDollarsInput(
                        (position.shares * price * frac).toFixed(2),
                      )
                    }
                    className="rounded border border-edge bg-bg-elev2 px-2 py-0.5 text-[11px] text-ink-dim hover:text-ink"
                  >
                    {frac === 1 ? "Sell All" : `${frac * 100}%`}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <input
              type="number"
              min={0}
              max={position.shares}
              step="any"
              value={sharesInput}
              onChange={(e) => setSharesInput(e.target.value)}
              className="w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
            />
          )}

          <div className="rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs">
            <div className="flex justify-between text-ink-dim">
              <span>{mode === "dollars" ? "≈ shares" : "≈ total"}</span>
              <span className="font-semibold text-ink tabular">
                {mode === "dollars"
                  ? `${fmtShares(shares)} sh`
                  : fmtPrice(total)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-dim">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why selling?"
              maxLength={200}
              className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
            />
          </div>
          {error && (
            <div className="rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm hover:border-signal-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-signal-red px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-red/90 disabled:opacity-50"
            >
              {submitting ? "Selling..." : "Sell at market"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CopyToTimeSimModal({
  defaultName,
  earliestTradeDate,
  submitting,
  onClose,
  onConfirm,
}: {
  defaultName: string;
  earliestTradeDate: string | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (name: string, startDate: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(defaultName);
  const [startDate, setStartDate] = useState(
    earliestTradeDate ?? today,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return;
    onConfirm(name.trim(), startDate);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-edge bg-bg-elev p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Copy to Time Sim</h3>
        <p className="mt-1 text-xs text-ink-dim">
          Forks this portfolio into a new time-aware simulation as if it
          had been created on the chosen start date. Each open position
          gets a synthetic BUY on the start date for the same dollar
          amount the source put into it (cost basis), executed at that
          day&apos;s historical close — so share counts adjust to the
          earlier price but allocations match. Continue trading forward
          from there.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              max={today}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
              required
            />
            <div className="mt-1 text-[11px] text-ink-dim">
              The new sim&apos;s starting cash = this portfolio&apos;s total
              value on this date. Use a past date to fork from a historical
              snapshot, or today to fork from the current state.
              {earliestTradeDate && earliestTradeDate !== startDate && (
                <span className="ml-1">
                  (First trade in this sim was {earliestTradeDate}.)
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm hover:border-signal-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-signal-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-accent/90 disabled:opacity-50"
            >
              {submitting ? "Copying..." : "Create time sim"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
