"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, DollarSign, Hash, Plus } from "lucide-react";
import { fmtPrice, fmtShares } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SimSummary } from "@/lib/types-sim";

interface Props {
  symbol: string;
  tvTicker: string;
  name: string;
  currentPrice: number | null;
}

type Side = "BUY" | "SELL";
type Mode = "shares" | "dollars";

export function TradeButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!props.currentPrice}
        className="inline-flex items-center gap-1.5 rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90 disabled:opacity-50"
      >
        <Briefcase className="h-3.5 w-3.5" />
        Trade
      </button>
      {open && (
        <TradeModal
          {...props}
          onClose={() => setOpen(false)}
          onTraded={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TradeModal({
  symbol,
  tvTicker,
  name,
  currentPrice,
  onClose,
  onTraded,
}: Props & { onClose: () => void; onTraded: () => void }) {
  const [sims, setSims] = useState<SimSummary[] | null>(null);
  const [simId, setSimId] = useState<string>("");
  const [side, setSide] = useState<Side>("BUY");
  const [mode, setMode] = useState<Mode>("dollars");
  const [sharesInput, setSharesInput] = useState("10");
  const [dollarsInput, setDollarsInput] = useState("1000");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

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

  // The chosen simulation, used for cash/limit hints
  const sim = sims?.find((s) => s.id === simId) ?? null;

  // Compute effective shares from whichever input is active
  const { shares, total } = useMemo(() => {
    if (!currentPrice) return { shares: 0, total: 0 };
    if (mode === "shares") {
      const sh = Math.max(0, Number(sharesInput) || 0);
      return { shares: sh, total: sh * currentPrice };
    }
    const dollars = Math.max(0, Number(dollarsInput) || 0);
    return { shares: dollars / currentPrice, total: dollars };
  }, [mode, sharesInput, dollarsInput, currentPrice]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!simId) {
      setError("Pick a simulation");
      return;
    }
    if (!(shares > 0)) {
      setError(
        mode === "dollars" ? "Enter an amount > $0" : "Enter shares > 0",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/simulations/${simId}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          tvTicker,
          side,
          shares,
          note: note || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setSuccess(
        `${side} ${fmtShares(j.trade.shares)} ${symbol} @ ${fmtPrice(j.trade.price)} = ${fmtPrice(j.trade.shares * j.trade.price)}`,
      );
      setTimeout(onTraded, 1300);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  // Quick-set dollar amounts based on available cash
  const presets: Array<{ label: string; dollars: number }> = useMemo(() => {
    if (side !== "BUY" || !sim) return [];
    return [
      { label: "25%", dollars: sim.cash * 0.25 },
      { label: "50%", dollars: sim.cash * 0.5 },
      { label: "Max", dollars: sim.cash },
    ];
  }, [side, sim]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-edge bg-bg-elev p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Trade {symbol}</h3>
            <p className="mt-0.5 text-xs text-ink-dim">
              {name} · Live price{" "}
              <span className="text-ink tabular">
                {currentPrice ? fmtPrice(currentPrice) : "—"}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-dim hover:text-ink"
            aria-label="Close"
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
              You don&apos;t have any simulations yet.
            </div>
            <Link
              href="/simulations/new"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90"
            >
              <Plus className="h-3.5 w-3.5" /> Create one
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-dim">
                Simulation
              </label>
              <select
                value={simId}
                onChange={(e) => setSimId(e.target.value)}
                className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
              >
                {sims.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {fmtPrice(s.cash)} cash
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide("BUY")}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
                  side === "BUY"
                    ? "border-signal-green bg-signal-green/15 text-signal-green"
                    : "border-edge bg-bg-elev2 text-ink-dim hover:text-ink",
                )}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setSide("SELL")}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
                  side === "SELL"
                    ? "border-signal-red bg-signal-red/15 text-signal-red"
                    : "border-edge bg-bg-elev2 text-ink-dim hover:text-ink",
                )}
              >
                SELL
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
                Amount
              </label>
              <div className="flex rounded-md border border-edge bg-bg-elev2 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("dollars")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors",
                    mode === "dollars"
                      ? "bg-signal-accent text-white"
                      : "text-ink-dim hover:text-ink",
                  )}
                >
                  <DollarSign className="h-3 w-3" /> Dollars
                </button>
                <button
                  type="button"
                  onClick={() => setMode("shares")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors",
                    mode === "shares"
                      ? "bg-signal-accent text-white"
                      : "text-ink-dim hover:text-ink",
                  )}
                >
                  <Hash className="h-3 w-3" /> Shares
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
                {presets.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setDollarsInput(p.dollars.toFixed(2))}
                        className="rounded border border-edge bg-bg-elev2 px-2 py-0.5 text-[11px] text-ink-dim hover:text-ink"
                      >
                        {p.label} ({fmtPrice(p.dollars)})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  placeholder="e.g., 10 or 2.5"
                  className="w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
                />
              </div>
            )}

            {/* Preview */}
            <div className="rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs">
              <div className="flex items-center justify-between text-ink-dim">
                <span>{mode === "dollars" ? "≈ shares" : "≈ total"}</span>
                <span className="font-semibold text-ink tabular">
                  {mode === "dollars"
                    ? `${fmtShares(shares)} sh`
                    : fmtPrice(total)}
                </span>
              </div>
              {sim && side === "BUY" && (
                <div className="mt-1 flex items-center justify-between text-ink-dim">
                  <span>After this trade, cash</span>
                  <span className="tabular">
                    {fmtPrice(sim.cash - total)}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-dim">
                Note (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why this trade?"
                maxLength={200}
                className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-signal-green/40 bg-signal-green/10 px-3 py-2 text-xs text-signal-green">
                {success}
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
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50",
                  side === "BUY"
                    ? "bg-signal-green hover:bg-signal-green/90"
                    : "bg-signal-red hover:bg-signal-red/90",
                )}
              >
                {submitting ? "Placing..." : `${side} at market`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
