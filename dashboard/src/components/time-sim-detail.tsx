"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Trash2,
  Zap,
} from "lucide-react";
import { encodeSymbolPath, fmtPct, fmtPrice, fmtShares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EquityCurveChart } from "@/components/equity-curve";
import {
  AutoRulesFields,
  type AutoRulesDraft,
} from "@/components/auto-rules-fields";
import type {
  AutoRules,
  EquityCurve,
  Position,
  SimDetail,
  Trade,
} from "@/lib/types-sim";

interface DailySnapshotClient {
  date: string;
  cash: number;
  positions: Array<{
    symbol: string;
    shares: number;
    avgCost: number;
    costBasis: number;
    close: number | null;
    marketValue: number;
    unrealizedPnlPct: number;
    isAutoBought: boolean;
  }>;
  value: number;
  tradesToday: Trade[];
  scannerTop3: Array<{
    symbol: string;
    score: number;
    close: number;
    rsi: number | null;
    macdSpread: number | null;
  }>;
}

interface TimeSimDetailData extends SimDetail {
  asOfDate: string;
  allTrades: Trade[];
  startDate?: string;
  autoRules?: AutoRules;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimeSimDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<TimeSimDetailData | null>(null);
  const [curve, setCurve] = useState<EquityCurve | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>(todayStr());
  const [showAdd, setShowAdd] = useState(false);
  const [showSell, setShowSell] = useState<Position | null>(null);

  // Auto-rules: snapshot series from the engine, player controls, and
  // edit/run modal state.
  const [snapshots, setSnapshots] = useState<DailySnapshotClient[] | null>(
    null,
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 5>(1);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showEditRules, setShowEditRules] = useState(false);
  const [running, setRunning] = useState(false);
  const playRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(
    async (date: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = `?asOf=${encodeURIComponent(date)}`;
        const [simRes, curveRes] = await Promise.all([
          fetch(`/api/timesims/${id}${qs}`, { cache: "no-store" }),
          fetch(`/api/timesims/${id}/equity${qs}`, { cache: "no-store" }),
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
    },
    [id],
  );

  useEffect(() => {
    load(asOf);
  }, [load, asOf]);

  const deleteSim = async () => {
    if (
      !confirm(
        `Delete time simulation "${data?.name}"? This cannot be undone.`,
      )
    )
      return;
    await fetch(`/api/timesims/${id}`, { method: "DELETE" });
    router.push("/time-sim");
  };

  const deleteTrade = async (tradeId: string) => {
    if (!confirm("Delete this trade? Position state will be recomputed.")) {
      return;
    }
    const res = await fetch(
      `/api/timesims/${id}/trade?tradeId=${encodeURIComponent(tradeId)}`,
      { method: "DELETE" },
    );
    if (res.ok) load(asOf);
    else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to delete trade");
    }
  };

  /* ---------------------- auto-rules: player + run ---------------------- */

  const snapshotsByDate = useMemo(() => {
    if (!snapshots) return null;
    const m = new Map<string, DailySnapshotClient>();
    for (const s of snapshots) m.set(s.date, s);
    return m;
  }, [snapshots]);

  // While the player is "playing", advance asOf one snapshot per tick.
  useEffect(() => {
    if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
    if (!playing || !snapshots || snapshots.length === 0) return;
    const intervalMs = speed === 1 ? 800 : speed === 2 ? 400 : 160;
    playRef.current = setInterval(() => {
      setAsOf((current) => {
        const idx = snapshots.findIndex((s) => s.date === current);
        if (idx === -1) return snapshots[0].date;
        if (idx >= snapshots.length - 1) {
          setPlaying(false);
          return current;
        }
        return snapshots[idx + 1].date;
      });
    }, intervalMs);
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, speed, snapshots]);

  const runRules = useCallback(
    async (endDate: string) => {
      setRunning(true);
      setShowRunModal(false);
      try {
        const res = await fetch(`/api/timesims/${id}/run-rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endDate }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Failed to run rules");
        setSnapshots(j.dailySnapshots as DailySnapshotClient[]);
        if (j.dailySnapshots?.length > 0) {
          setAsOf(j.dailySnapshots[0].date);
        }
        await load(asOf);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Run failed");
      } finally {
        setRunning(false);
      }
    },
    [id, asOf, load],
  );

  const saveRules = useCallback(
    async (rules: AutoRules | null) => {
      const res = await fetch(`/api/timesims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRules: rules }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? "Failed to save rules");
        return;
      }
      setShowEditRules(false);
      load(asOf);
    },
    [id, asOf, load],
  );

  const currentSnapshot = snapshotsByDate?.get(asOf) ?? null;

  // Slider/date-picker bounds: lower bound is the scenario startDate (falling
  // back to earliest trade or a far-past sentinel). Upper bound is always today.
  const dateBounds = useMemo(() => {
    const today = todayStr();
    if (!data) return { min: "2010-01-01", max: today };
    let min = data.startDate;
    if (!min && data.allTrades.length > 0) {
      const sorted = [...data.allTrades].sort(
        (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
      );
      min = sorted[0].timestamp.slice(0, 10);
    }
    return { min: min ?? "2010-01-01", max: today };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="py-12 text-center text-sm text-ink-dim">Loading...</div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/time-sim"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to time simulations
        </Link>
        <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-4 text-sm text-signal-red">
          {error ?? "Not found"}
        </div>
      </div>
    );
  }

  const up = data.totalPnl >= 0;
  const tradesAfterAsOf = data.allTrades.filter(
    (t) => t.timestamp.slice(0, 10) > asOf,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/time-sim"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to time simulations
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add dated trade
          </button>
          <button
            onClick={() => load(asOf)}
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
        <div className="inline-flex items-center gap-1.5 rounded-md bg-signal-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal-blue">
          <Clock className="h-3 w-3" /> Time-aware sim
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {data.name}
        </h1>
        {data.description && (
          <p className="mt-1 text-sm text-ink-dim">{data.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-dim">
          {data.startDate && (
            <span>
              <strong className="font-semibold text-ink">
                Start date {data.startDate}
              </strong>
            </span>
          )}
          {data.startDate && <span>·</span>}
          <span>Created {new Date(data.createdAt).toLocaleDateString()}</span>
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

      {/* Auto-rules panel */}
      <AutoRulesPanel
        rules={data.autoRules}
        startDate={data.startDate}
        running={running}
        snapshotsActive={!!snapshots}
        onEdit={() => setShowEditRules(true)}
        onRun={() => setShowRunModal(true)}
        onClearSnapshots={() => {
          setSnapshots(null);
          setPlaying(false);
        }}
      />

      {/* As-of date selector */}
      <div className="rounded-lg border border-edge bg-bg-elev p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            <CalendarDays className="h-4 w-4" />
            <span>Portfolio as of</span>
            {snapshots && (
              <span className="rounded bg-signal-accent/15 px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-signal-accent">
                Step-through active ({snapshots.length} days)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={asOf}
              min={dateBounds.min}
              max={dateBounds.max}
              onChange={(e) => setAsOf(e.target.value)}
              className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm focus:border-signal-accent focus:outline-none"
            />
            <button
              onClick={() => setAsOf(todayStr())}
              className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs hover:border-signal-accent"
            >
              Today
            </button>
            {data.startDate && (
              <button
                onClick={() => setAsOf(data.startDate ?? dateBounds.min)}
                className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs hover:border-signal-accent"
              >
                Start date
              </button>
            )}
          </div>
        </div>
        {(data.startDate || data.allTrades.length > 0) &&
          dateBounds.min !== dateBounds.max && (
            <>
              <input
                type="range"
                min={+new Date(dateBounds.min)}
                max={+new Date(dateBounds.max)}
                step={86_400_000}
                value={Math.max(
                  +new Date(dateBounds.min),
                  Math.min(+new Date(asOf), +new Date(dateBounds.max)),
                )}
                onChange={(e) =>
                  setAsOf(
                    new Date(Number(e.target.value))
                      .toISOString()
                      .slice(0, 10),
                  )
                }
                className="mt-4 w-full accent-signal-accent"
              />
              <div className="mt-1 flex justify-between text-[10px] text-ink-dim">
                <span>{dateBounds.min}</span>
                <span>{dateBounds.max}</span>
              </div>
            </>
          )}
        {tradesAfterAsOf > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded bg-signal-amber/10 px-2 py-1 text-[11px] text-signal-amber">
            {tradesAfterAsOf} trade{tradesAfterAsOf === 1 ? "" : "s"} after
            this date are hidden from this view.
          </div>
        )}

        {/* Player controls — only shown when a backtest run is loaded */}
        {snapshots && snapshots.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-edge pt-3">
            <button
              onClick={() => {
                if (
                  snapshots[snapshots.length - 1].date === asOf &&
                  !playing
                ) {
                  setAsOf(snapshots[0].date);
                }
                setPlaying((p) => !p);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                playing
                  ? "bg-signal-amber text-bg"
                  : "bg-signal-accent text-white hover:bg-signal-accent/90",
              )}
            >
              {playing ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Play
                </>
              )}
            </button>
            <div className="flex rounded-md border border-edge bg-bg-elev2 p-0.5 text-xs">
              {([1, 2, 5] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "rounded px-2 py-1",
                    speed === s
                      ? "bg-signal-accent text-white"
                      : "text-ink-dim hover:text-ink",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="text-[11px] text-ink-dim">
              Day{" "}
              {Math.max(
                1,
                (snapshots.findIndex((s) => s.date === asOf) + 1) || 1,
              )}{" "}
              of {snapshots.length}
            </div>
          </div>
        )}
      </div>

      {/* Today's auto-trades + scanner top-3 — visible during step-through */}
      {currentSnapshot && (
        <TodayPanel snapshot={currentSnapshot} rules={data.autoRules} />
      )}

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatBlock
          label="Total Value"
          value={fmtPrice(data.totalValue)}
          hint={`on ${asOf}`}
        />
        <StatBlock
          label="P/L"
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
        <StatBlock label="Cash" value={fmtPrice(data.cash)} />
        <StatBlock
          label="Realized P/L"
          value={fmtPrice(data.realizedPnl)}
          tone={data.realizedPnl >= 0 ? "green" : "red"}
        />
        <StatBlock
          label="Unrealized P/L"
          value={fmtPrice(data.unrealizedPnl)}
          tone={data.unrealizedPnl >= 0 ? "green" : "red"}
        />
      </div>

      {/* Equity curve */}
      <div>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-ink-dim">
          <span>Equity curve</span>
          {curve && curve.points.length > 0 && (
            <span className="font-normal normal-case text-[11px]">
              · max drawdown {curve.maxDrawdownPct.toFixed(2)}%
            </span>
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
          Open positions on {asOf}
        </h2>
        {data.positions.length === 0 ? (
          <div className="rounded-lg border border-edge bg-bg-elev p-6 text-center text-sm text-ink-dim">
            No open positions on this date. Use{" "}
            <strong>Add dated trade</strong> to record a buy.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-sm">
              <thead className="bg-bg-elev">
                <tr>
                  <Th>Symbol</Th>
                  <Th align="right">Shares</Th>
                  <Th align="right">Avg Cost</Th>
                  <Th align="right">Cost Basis</Th>
                  <Th align="right">Close on {asOf}</Th>
                  <Th align="right">Mkt Value</Th>
                  <Th align="right">Unrealized P/L</Th>
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
          Trade history ({data.allTrades.length}
          {tradesAfterAsOf > 0 &&
            ` total — ${data.trades.length} on or before ${asOf}`}
          )
        </h2>
        {data.allTrades.length === 0 ? (
          <div className="rounded-lg border border-edge bg-bg-elev p-6 text-center text-sm text-ink-dim">
            No trades yet. Click <strong>Add dated trade</strong> to record
            your first buy with a date.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-sm">
              <thead className="bg-bg-elev">
                <tr>
                  <Th>Date</Th>
                  <Th>Side</Th>
                  <Th>Symbol</Th>
                  <Th align="right">Shares</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Total</Th>
                  <Th>Note</Th>
                  <Th align="right">&nbsp;</Th>
                </tr>
              </thead>
              <tbody>
                {[...data.allTrades]
                  .sort(
                    (a, b) =>
                      +new Date(b.timestamp) - +new Date(a.timestamp),
                  )
                  .map((t: Trade) => {
                    const future = t.timestamp.slice(0, 10) > asOf;
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          "border-b border-edge/60 hover:bg-bg-elev/60",
                          future && "opacity-50",
                        )}
                      >
                        <td className="px-3 py-2 text-xs text-ink-dim">
                          {t.timestamp.slice(0, 10)}
                          {future && (
                            <span className="ml-1 rounded bg-signal-amber/15 px-1 py-0.5 text-[9px] uppercase tracking-wider text-signal-amber">
                              future
                            </span>
                          )}
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
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => deleteTrade(t.id)}
                            className="rounded p-1 text-ink-dim hover:bg-signal-red/10 hover:text-signal-red"
                            title="Delete trade"
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

      {showAdd && (
        <AddDatedTradeModal
          simId={data.id}
          defaultDate={
            data.allTrades.length === 0 && data.startDate
              ? data.startDate
              : asOf
          }
          minDate={data.startDate ?? undefined}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load(asOf);
          }}
        />
      )}

      {showSell && (
        <SellDatedModal
          simId={data.id}
          position={showSell}
          defaultDate={asOf}
          minDate={data.startDate ?? undefined}
          onClose={() => setShowSell(null)}
          onSold={() => {
            setShowSell(null);
            load(asOf);
          }}
        />
      )}

      {showRunModal && data.startDate && (
        <RunRulesModal
          startDate={data.startDate}
          defaultEndDate={todayStr()}
          submitting={running}
          onClose={() => setShowRunModal(false)}
          onConfirm={runRules}
        />
      )}

      {showEditRules && (
        <EditRulesModal
          initial={data.autoRules}
          onClose={() => setShowEditRules(false)}
          onSave={saveRules}
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
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-lg border border-edge bg-bg-elev p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
        {label}
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
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

// -----------------------------------------------------------------------------
// Add dated trade (BUY or SELL on a chosen date) modal
// -----------------------------------------------------------------------------
function AddDatedTradeModal({
  simId,
  defaultDate,
  minDate,
  onClose,
  onSaved,
}: {
  simId: string;
  defaultDate: string;
  minDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [date, setDate] = useState(defaultDate);
  const [mode, setMode] = useState<"shares" | "dollars">("dollars");
  const [shares, setShares] = useState("");
  const [dollars, setDollars] = useState("");
  const [price, setPrice] = useState(""); // optional override
  const [autoPrice, setAutoPrice] = useState<number | null>(null);
  const [autoPriceDay, setAutoPriceDay] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch close-on-date whenever symbol+date settle for a bit
  useEffect(() => {
    setAutoPrice(null);
    setAutoPriceDay(null);
    setPriceErr(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym || !date) return;
    const t = setTimeout(async () => {
      setPriceLoading(true);
      try {
        const res = await fetch(
          `/api/timesims/price?symbol=${encodeURIComponent(
            sym,
          )}&date=${encodeURIComponent(date)}`,
        );
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Failed");
        setAutoPrice(j.price);
        setAutoPriceDay(j.actualDay);
      } catch (e) {
        setPriceErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setPriceLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [symbol, date]);

  const effectivePrice =
    Number(price) > 0
      ? Number(price)
      : autoPrice !== null
        ? autoPrice
        : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      setError("Symbol required");
      return;
    }
    if (!date) {
      setError("Date required");
      return;
    }
    const sharesN = Number(shares);
    const dollarsN = Number(dollars);
    if (mode === "shares" && !(sharesN > 0)) {
      setError("Shares must be > 0");
      return;
    }
    if (mode === "dollars" && !(dollarsN > 0)) {
      setError("Dollar amount must be > 0");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        symbol: sym,
        side,
        date,
        note: note || undefined,
      };
      if (mode === "shares") body.shares = sharesN;
      else body.dollars = dollarsN;
      if (Number(price) > 0) body.price = Number(price);
      const res = await fetch(`/api/timesims/${simId}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onSaved();
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
        className="w-full max-w-lg rounded-lg border border-edge bg-bg-elev p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Add dated trade</h3>
        <p className="mt-1 text-xs text-ink-dim">
          Record a buy or sell on a specific historical date. Price defaults to
          that day&apos;s Yahoo close — override it if you got a different fill.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                Side
              </label>
              <div className="mt-1 flex rounded-md border border-edge bg-bg-elev2 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSide("BUY")}
                  className={cn(
                    "flex-1 rounded px-2 py-1.5",
                    side === "BUY"
                      ? "bg-signal-green text-white"
                      : "text-ink-dim hover:text-ink",
                  )}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide("SELL")}
                  className={cn(
                    "flex-1 rounded px-2 py-1.5",
                    side === "SELL"
                      ? "bg-signal-red text-white"
                      : "text-ink-dim hover:text-ink",
                  )}
                >
                  SELL
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm uppercase focus:border-signal-accent focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                Date
              </label>
              <input
                type="date"
                value={date}
                min={minDate}
                max={todayStr()}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm focus:border-signal-accent focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Price hint / lookup */}
          <div className="rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs">
            {priceLoading ? (
              <span className="text-ink-dim">
                Fetching close for {symbol || "—"} on {date}...
              </span>
            ) : priceErr ? (
              <span className="text-signal-red">{priceErr}</span>
            ) : autoPrice !== null ? (
              <span>
                <span className="text-ink-dim">
                  Yahoo close on {autoPriceDay}:
                </span>{" "}
                <span className="font-semibold tabular text-ink">
                  {fmtPrice(autoPrice)}
                </span>
                {autoPriceDay && autoPriceDay !== date && (
                  <span className="ml-1 text-[10px] text-signal-amber">
                    (nearest trading day before {date})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-ink-dim">
                Enter a symbol and date to look up the historical close.
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                  Amount
                </label>
                <div className="flex rounded-md border border-edge bg-bg-elev2 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setMode("dollars")}
                    className={cn(
                      "rounded px-1.5 py-0.5",
                      mode === "dollars"
                        ? "bg-signal-accent text-white"
                        : "text-ink-dim",
                    )}
                  >
                    $
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("shares")}
                    className={cn(
                      "rounded px-1.5 py-0.5",
                      mode === "shares"
                        ? "bg-signal-accent text-white"
                        : "text-ink-dim",
                    )}
                  >
                    #
                  </button>
                </div>
              </div>
              {mode === "dollars" ? (
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={dollars}
                    onChange={(e) => setDollars(e.target.value)}
                    placeholder="5000"
                    className="w-full rounded-md border border-edge bg-bg-elev2 py-1.5 pl-7 pr-3 text-sm focus:border-signal-accent focus:outline-none"
                  />
                </div>
              ) : (
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  placeholder="100"
                  className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm focus:border-signal-accent focus:outline-none"
                />
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                Price override (optional)
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={
                    autoPrice !== null ? autoPrice.toFixed(2) : "auto"
                  }
                  className="w-full rounded-md border border-edge bg-bg-elev2 py-1.5 pl-7 pr-3 text-sm focus:border-signal-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Estimated total */}
          {effectivePrice !== null && (
            <div className="rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs text-ink-dim">
              {mode === "dollars" && Number(dollars) > 0 && (
                <>
                  ≈{" "}
                  <span className="font-semibold tabular text-ink">
                    {fmtShares(Number(dollars) / effectivePrice)} shares
                  </span>{" "}
                  @ {fmtPrice(effectivePrice)}
                </>
              )}
              {mode === "shares" && Number(shares) > 0 && (
                <>
                  ≈{" "}
                  <span className="font-semibold tabular text-ink">
                    {fmtPrice(Number(shares) * effectivePrice)}
                  </span>{" "}
                  total @ {fmtPrice(effectivePrice)}
                </>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Thesis / setup / catalyst"
              maxLength={200}
              className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm focus:border-signal-accent focus:outline-none"
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
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50",
                side === "BUY"
                  ? "bg-signal-green hover:bg-signal-green/90"
                  : "bg-signal-red hover:bg-signal-red/90",
              )}
            >
              {submitting
                ? "Saving..."
                : side === "BUY"
                  ? "Record buy"
                  : "Record sell"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sell-from-position modal (date-aware variant of the regular SellModal)
// -----------------------------------------------------------------------------
function SellDatedModal({
  simId,
  position,
  defaultDate,
  minDate,
  onClose,
  onSold,
}: {
  simId: string;
  position: Position;
  defaultDate: string;
  minDate?: string;
  onClose: () => void;
  onSold: () => void;
}) {
  const [mode, setMode] = useState<"shares" | "dollars">("dollars");
  const [sharesInput, setSharesInput] = useState(String(position.shares));
  const [date, setDate] = useState(defaultDate);
  const [dollarsInput, setDollarsInput] = useState(
    position.currentPrice
      ? (position.shares * position.currentPrice).toFixed(2)
      : "0",
  );
  const [autoPrice, setAutoPrice] = useState<number | null>(
    position.currentPrice ?? null,
  );
  const [autoPriceDay, setAutoPriceDay] = useState<string | null>(defaultDate);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch close on the chosen sell date
  useEffect(() => {
    setPriceErr(null);
    const t = setTimeout(async () => {
      setPriceLoading(true);
      try {
        const res = await fetch(
          `/api/timesims/price?symbol=${encodeURIComponent(
            position.symbol,
          )}&date=${encodeURIComponent(date)}`,
        );
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Failed");
        setAutoPrice(j.price);
        setAutoPriceDay(j.actualDay);
      } catch (e) {
        setPriceErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setPriceLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [position.symbol, date]);

  const price = autoPrice ?? position.currentPrice ?? position.avgCost;
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
        `You only hold ${fmtShares(position.shares)} shares.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/timesims/${simId}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: position.symbol,
          tvTicker: position.tvTicker,
          side: "SELL",
          shares,
          date,
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
          {fmtPrice(position.avgCost)}
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
              Sell date
            </label>
            <input
              type="date"
              value={date}
              min={minDate}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm focus:border-signal-accent focus:outline-none"
            />
          </div>

          <div className="rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs">
            {priceLoading ? (
              <span className="text-ink-dim">Fetching close...</span>
            ) : priceErr ? (
              <span className="text-signal-red">{priceErr}</span>
            ) : (
              <span>
                <span className="text-ink-dim">
                  Close on {autoPriceDay ?? date}:
                </span>{" "}
                <span className="font-semibold tabular text-ink">
                  {fmtPrice(price)}
                </span>
              </span>
            )}
          </div>

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
                    : "text-ink-dim",
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
                    : "text-ink-dim",
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
              {submitting ? "Selling..." : `Sell on ${date}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================ auto-rules sub-UI =========================== */

const STRATEGY_LABELS: Record<AutoRules["reinvestStrategy"], string> = {
  oversold: "Oversold (RSI < 30)",
  breakout: "Momentum Breakout",
  macd_cross: "MACD Bullish Cross",
};

function AutoRulesPanel({
  rules,
  startDate,
  running,
  snapshotsActive,
  onEdit,
  onRun,
  onClearSnapshots,
}: {
  rules?: AutoRules;
  startDate?: string;
  running: boolean;
  snapshotsActive: boolean;
  onEdit: () => void;
  onRun: () => void;
  onClearSnapshots: () => void;
}) {
  if (!rules) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-edge bg-bg-elev p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-ink-dim" />
          <div>
            <div className="text-sm font-medium">No auto-rules attached</div>
            <div className="text-xs text-ink-dim">
              Add stop-loss / take-profit + a reinvest strategy to backtest
              an automated rotation.
            </div>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90"
        >
          Configure auto-rules
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-edge bg-bg-elev p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Zap className="mt-0.5 h-4 w-4 text-signal-accent" />
          <div>
            <div className="text-sm font-semibold">Auto-rules</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-dim">
              <span>
                SL <span className="text-signal-red">-{rules.stopLossPct}%</span>
              </span>
              <span>
                TP{" "}
                <span className="text-signal-green">
                  +{rules.takeProfitPct}%
                </span>
              </span>
              <span>
                Reinvest:{" "}
                <span className="text-ink">
                  top {STRATEGY_LABELS[rules.reinvestStrategy]}
                </span>
              </span>
              <span>
                Scope:{" "}
                <span className="text-ink">
                  {rules.ruleScope === "all" ? "all positions" : "auto only"}
                </span>
              </span>
              <span>
                Dup:{" "}
                <span className="text-ink">
                  {rules.duplicateHandling === "skip_to_next"
                    ? "skip"
                    : rules.duplicateHandling === "pyramid"
                      ? "pyramid"
                      : "hold cash"}
                </span>
              </span>
              <span>
                No-match:{" "}
                <span className="text-ink">
                  {rules.noMatchBehavior === "hold_cash" ? "hold" : "relax"}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {snapshotsActive && (
            <button
              onClick={onClearSnapshots}
              className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs hover:border-signal-accent"
            >
              Clear player
            </button>
          )}
          <button
            onClick={onEdit}
            className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs hover:border-signal-accent"
          >
            Edit
          </button>
          <button
            onClick={onRun}
            disabled={running || !startDate}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-accent/90 disabled:opacity-50"
          >
            {running ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Run auto-rules
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayPanel({
  snapshot,
  rules,
}: {
  snapshot: DailySnapshotClient;
  rules?: AutoRules;
}) {
  const buys = snapshot.tradesToday.filter((t) => t.side === "BUY");
  const sells = snapshot.tradesToday.filter((t) => t.side === "SELL");
  const hasActivity = snapshot.tradesToday.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-edge bg-bg-elev p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          Today&apos;s auto-trades
        </h3>
        {hasActivity ? (
          <ul className="mt-3 space-y-2 text-sm">
            {sells.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-2 rounded-md border border-signal-red/20 bg-signal-red/5 px-3 py-2"
              >
                <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-red" />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-semibold text-signal-red">
                      SELL
                    </span>{" "}
                    {fmtShares(t.shares)} {t.symbol} @ {fmtPrice(t.price)}
                  </div>
                  <div className="text-[11px] text-ink-dim">{t.note}</div>
                </div>
                <div className="text-right text-xs tabular text-ink-dim">
                  {fmtPrice(t.shares * t.price)}
                </div>
              </li>
            ))}
            {buys.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-2 rounded-md border border-signal-green/20 bg-signal-green/5 px-3 py-2"
              >
                <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-green" />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-semibold text-signal-green">
                      BUY
                    </span>{" "}
                    {fmtShares(t.shares)} {t.symbol} @ {fmtPrice(t.price)}
                  </div>
                  <div className="text-[11px] text-ink-dim">{t.note}</div>
                </div>
                <div className="text-right text-xs tabular text-ink-dim">
                  {fmtPrice(t.shares * t.price)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-edge bg-bg-elev2 p-3 text-center text-xs text-ink-dim">
            No auto-trades fired on this date.
          </div>
        )}
      </div>

      <div className="rounded-lg border border-edge bg-bg-elev p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          Scanner top 3
          {rules && (
            <span className="ml-1 font-normal normal-case tracking-normal text-ink-dim">
              · {STRATEGY_LABELS[rules.reinvestStrategy]}
            </span>
          )}
        </h3>
        {snapshot.scannerTop3.length > 0 ? (
          <ol className="mt-3 space-y-2 text-sm">
            {snapshot.scannerTop3.map((c, i) => {
              const wasBought = snapshot.tradesToday.some(
                (t) =>
                  t.side === "BUY" &&
                  t.symbol.toUpperCase() === c.symbol.toUpperCase(),
              );
              return (
                <li
                  key={c.symbol}
                  className="flex items-center justify-between gap-2 rounded-md border border-edge bg-bg-elev2 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-dim">{i + 1}.</span>
                    <Link
                      href={`/stocks/${encodeSymbolPath(c.symbol)}`}
                      className="font-semibold text-signal-blue hover:underline"
                    >
                      {c.symbol}
                    </Link>
                    {wasBought && (
                      <span className="rounded bg-signal-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-signal-green">
                        BOUGHT
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-dim tabular">
                    {c.rsi !== null && (
                      <span className="mr-3">RSI {c.rsi.toFixed(1)}</span>
                    )}
                    {fmtPrice(c.close)}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-edge bg-bg-elev2 p-3 text-center text-xs text-ink-dim">
            No candidates matched the strategy today.
          </div>
        )}
      </div>
    </div>
  );
}

function RunRulesModal({
  startDate,
  defaultEndDate,
  submitting,
  onClose,
  onConfirm,
}: {
  startDate: string;
  defaultEndDate: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (endDate: string) => void;
}) {
  const [endDate, setEndDate] = useState(defaultEndDate);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-edge bg-bg-elev p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Run auto-rules</h3>
        <p className="mt-1 text-xs text-ink-dim">
          Replays every trading day from <strong>{startDate}</strong> to the
          end date, firing SL/TP exits and reinvesting freed cash into the
          top scanner pick. Clears prior auto-trades; keeps manual trades.
          First run pre-fetches ~2y of S&amp;P 500 prices (10–30s) — later
          runs use cached data.
        </p>
        <div className="mt-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
            End date
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={defaultEndDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm hover:border-signal-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(endDate)}
            disabled={submitting}
            className="rounded-md bg-signal-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-accent/90 disabled:opacity-50"
          >
            {submitting ? "Running..." : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRulesModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: AutoRules;
  onClose: () => void;
  onSave: (rules: AutoRules | null) => void;
}) {
  const [draft, setDraft] = useState<AutoRulesDraft>({
    stopLossPct: initial?.stopLossPct ?? 5,
    takeProfitPct: initial?.takeProfitPct ?? 10,
    ruleScope: initial?.ruleScope ?? "auto_only",
    reinvestStrategy: initial?.reinvestStrategy ?? "oversold",
    duplicateHandling: initial?.duplicateHandling ?? "skip_to_next",
    noMatchBehavior: initial?.noMatchBehavior ?? "hold_cash",
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-xl rounded-lg border border-edge bg-bg-elev p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {initial ? "Edit auto-rules" : "Configure auto-rules"}
        </h3>
        <div className="mt-4">
          <AutoRulesFields value={draft} onChange={setDraft} />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {initial && (
            <button
              onClick={() => onSave(null)}
              className="mr-auto rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-1.5 text-xs font-medium text-signal-red hover:bg-signal-red/20"
            >
              Remove rules
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-sm hover:border-signal-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ ...draft, universe: "sp500" })}
            className="rounded-md bg-signal-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-accent/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
