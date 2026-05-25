"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Globe,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Pill } from "@/components/pill";
import { encodeSymbolPath, fmtPct, fmtPrice, ratingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AnalysisSummary } from "@/lib/analysis-store";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function scoreColor(score?: number): {
  hex: string;
  className: string;
  band: string;
} {
  if (score === undefined) {
    return { hex: "#8b949e", className: "text-ink-dim", band: "—" };
  }
  if (score >= 80) return { hex: "#3fb950", className: "text-signal-green", band: "Strong" };
  if (score >= 60) return { hex: "#3fb950", className: "text-signal-green", band: "Lean buy" };
  if (score >= 40) return { hex: "#d29922", className: "text-signal-amber", band: "Mixed" };
  if (score >= 20) return { hex: "#f85149", className: "text-signal-red", band: "Lean pass" };
  return { hex: "#f85149", className: "text-signal-red", band: "Pass" };
}

type SortKey = "date" | "short" | "mid" | "long";

export function AnalysesList() {
  const [data, setData] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyses", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setData((j.analyses ?? []) as AnalysisSummary[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Reset to first page whenever the filter or sort changes
  useEffect(() => {
    setPage(1);
  }, [filter, sort]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = data;
    if (q) {
      out = out.filter((a) => {
        const r = a.rationales;
        return (
          a.symbol.toLowerCase().includes(q) ||
          (r?.shortTerm ?? "").toLowerCase().includes(q) ||
          (r?.midTerm ?? "").toLowerCase().includes(q) ||
          (r?.longTerm ?? "").toLowerCase().includes(q)
        );
      });
    }
    if (sort !== "date") {
      const key: "shortTerm" | "midTerm" | "longTerm" =
        sort === "short" ? "shortTerm" : sort === "mid" ? "midTerm" : "longTerm";
      out = [...out].sort(
        (a, b) => (b.scores?.[key] ?? -1) - (a.scores?.[key] ?? -1),
      );
    }
    // date is already the API's default order
    return out;
  }, [data, filter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () =>
      filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [filtered, clampedPage],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-signal-accent" />
            AI Analyses
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            Every analysis generated so far — sorted newest first by default.
            Click any row to open the full report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-edge bg-bg-elev2 p-0.5 text-xs">
            {(
              [
                { key: "date" as const, label: "Newest" },
                { key: "short" as const, label: "Short" },
                { key: "mid" as const, label: "Mid" },
                { key: "long" as const, label: "Long" },
              ]
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  sort === opt.key
                    ? "bg-signal-accent text-white"
                    : "text-ink-dim hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium hover:border-signal-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-dim" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by ticker or rationale..."
          className="w-full max-w-md rounded-md border border-edge bg-bg-elev2 py-2 pl-9 pr-3 text-sm placeholder:text-ink-dim focus:border-signal-accent focus:outline-none"
        />
      </div>

      {error && (
        <div className="rounded-md border border-signal-red/40 bg-signal-red/10 p-3 text-sm text-signal-red">
          {error}
        </div>
      )}

      {filtered.length === 0 && !loading && !error && (
        <div className="rounded-lg border border-dashed border-edge bg-bg-elev p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-ink-dim" />
          <div className="mt-3 text-sm text-ink-dim">
            {data.length === 0
              ? "No analyses yet. Open any stock and click Request analysis to queue one."
              : "No analyses match this filter."}
          </div>
          {data.length === 0 && (
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-signal-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-signal-accent/90"
            >
              Browse the scanner →
            </Link>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {paginated.map((a) => {
            const s = a.scores;
            const sShort = scoreColor(s?.shortTerm);
            const sMid = scoreColor(s?.midTerm);
            const sLong = scoreColor(s?.longTerm);
            const rating = ratingLabel(a.snapshot?.rating ?? null);
            const change = a.snapshot?.change ?? null;
            // Pick a rationale to show as the row preview — prefer mid term
            // (the most representative single read for a list view).
            const previewRationale =
              a.rationales?.midTerm ??
              a.rationales?.shortTerm ??
              a.rationales?.longTerm;
            const horizons: Array<{
              label: string;
              c: ReturnType<typeof scoreColor>;
              n?: number;
            }> = [
              { label: "Short", c: sShort, n: s?.shortTerm },
              { label: "Mid", c: sMid, n: s?.midTerm },
              { label: "Long", c: sLong, n: s?.longTerm },
            ];
            return (
              <Link
                key={a.id}
                href={`/stocks/${encodeSymbolPath(a.symbol)}`}
                className="group block rounded-lg border border-edge bg-bg-elev p-4 transition-colors hover:border-signal-accent"
              >
                <div className="flex flex-wrap items-start gap-4">
                  {/* Three-horizon scores */}
                  <div className="flex shrink-0 items-center gap-2">
                    {horizons.map((h) => (
                      <div
                        key={h.label}
                        className="flex flex-col items-center gap-1"
                      >
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-dim">
                          {h.label}
                        </span>
                        <div
                          className="flex h-11 w-11 flex-col items-center justify-center rounded-full border-2"
                          style={{ borderColor: h.c.hex }}
                        >
                          <span
                            className="text-sm font-bold tabular leading-none"
                            style={{ color: h.c.hex }}
                          >
                            {h.n ?? "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="text-base font-semibold text-signal-blue group-hover:underline">
                        {a.symbol}
                      </span>
                      {rating && <Pill tone={rating.tone}>{rating.label}</Pill>}
                      <span className="text-xs text-ink-dim">
                        {a.snapshot.price !== null
                          ? fmtPrice(a.snapshot.price)
                          : ""}
                        {change !== null && (
                          <span
                            className={cn(
                              "ml-1 font-medium",
                              change >= 0
                                ? "text-signal-green"
                                : "text-signal-red",
                            )}
                          >
                            {fmtPct(change)}
                          </span>
                        )}
                      </span>
                    </div>
                    {previewRationale && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-dim line-clamp-2">
                        {previewRationale}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-dim">
                      <span>{timeAgo(a.generatedAt)}</span>
                      <span>·</span>
                      <span>{a.model}</span>
                      {a.usedWebSearch && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            web search
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:text-signal-accent" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <Pagination
          page={clampedPage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          onChange={setPage}
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  pageSize,
  totalItems,
  onChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onChange: (p: number) => void;
}) {
  // Compact window of page numbers around the current page
  const pages: (number | "...")[] = [];
  const push = (p: number | "...") => {
    if (pages[pages.length - 1] !== p) pages.push(p);
  };
  for (let p = 1; p <= totalPages; p++) {
    if (
      p === 1 ||
      p === totalPages ||
      (p >= page - 1 && p <= page + 1)
    ) {
      push(p);
    } else if (p === page - 2 || p === page + 2) {
      push("...");
    }
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <div className="text-xs text-ink-dim">
        Showing <span className="text-ink tabular">{first}</span>–
        <span className="text-ink tabular">{last}</span> of{" "}
        <span className="text-ink tabular">{totalItems}</span>
      </div>
      <div className="inline-flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-md border border-edge bg-bg-elev2 px-2.5 py-1.5 text-xs font-medium hover:border-signal-accent disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={"e" + i} className="px-1.5 text-xs text-ink-dim">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={cn(
                "min-w-[28px] rounded-md px-2 py-1 text-xs font-medium transition-colors",
                p === page
                  ? "bg-signal-accent text-white"
                  : "border border-edge bg-bg-elev2 text-ink-dim hover:border-signal-accent hover:text-ink",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-edge bg-bg-elev2 px-2.5 py-1.5 text-xs font-medium hover:border-signal-accent disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
