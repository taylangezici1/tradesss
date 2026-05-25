"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  Clock,
  Copy,
  ExternalLink,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { encodeSymbolPath } from "@/lib/format";
import { ConvictionGauge } from "@/components/conviction-gauge";
import type { StockAnalysis } from "@/lib/analysis-store";

interface Props {
  symbol: string;
}

type State =
  | { kind: "empty" }
  | { kind: "queued"; queuedAt: string }
  | { kind: "cached"; data: StockAnalysis; queuedAt?: string }
  | { kind: "loading" }
  | { kind: "error"; message: string };

const POLL_MS = 15_000;

export function AIAnalysis({ symbol }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setState({ kind: "loading" });
      try {
        const res = await fetch(
          `/api/stocks/analyze/${encodeSymbolPath(symbol)}`,
          { cache: "no-store" },
        );
        if (res.status === 404) {
          setState({ kind: "empty" });
          return;
        }
        const j = await res.json();
        if (res.status === 202 && j.status === "queued") {
          setState({ kind: "queued", queuedAt: j.queuedAt });
          return;
        }
        if (res.ok) {
          setState({
            kind: "cached",
            data: j as StockAnalysis,
            queuedAt: j.queuedAt,
          });
          return;
        }
        setState({
          kind: "error",
          message: j.detail ?? j.error ?? "Failed to load",
        });
      } catch (e) {
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Network error",
        });
      }
    },
    [symbol],
  );

  // initial load
  useEffect(() => {
    load();
  }, [load]);

  // poll while queued so the dashboard auto-updates once the morning task runs
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (state.kind === "queued" || (state.kind === "cached" && state.queuedAt)) {
      pollRef.current = setInterval(() => load(true), POLL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state.kind, "queuedAt" in state ? state.queuedAt : null, load]);

  const requestAnalysis = async (force = false) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/stocks/analyze/${encodeSymbolPath(symbol)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        },
      );
      const j = await res.json();
      if (!res.ok && res.status !== 202) {
        throw new Error(j.detail ?? j.error ?? "Failed");
      }
      // After queuing, refetch which may surface cached + queuedAt
      await load(true);
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const cancelRequest = async () => {
    await fetch(`/api/stocks/analyze/${encodeSymbolPath(symbol)}`, {
      method: "DELETE",
    });
    load();
  };

  const copy = async (markdown: string) => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-bg-elev p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-dim">
            <Sparkles className="h-4 w-4 text-signal-accent" />
            AI Analysis
          </h2>
          {state.kind === "cached" && (
            <div className="mt-1 text-[11px] text-ink-dim">
              Last generated {new Date(state.data.generatedAt).toLocaleString()}
              {state.queuedAt && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-signal-amber">
                  · refresh queued
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state.kind === "cached" && (
            <button
              onClick={() => copy(state.data.markdown)}
              className="inline-flex items-center gap-1 rounded-md border border-edge bg-bg-elev2 px-2.5 py-1 text-xs hover:border-signal-accent"
              title="Copy markdown"
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
          {state.kind === "queued" ? (
            <button
              onClick={cancelRequest}
              className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium text-ink-dim hover:border-signal-red hover:text-signal-red"
            >
              <X className="h-3.5 w-3.5" /> Cancel request
            </button>
          ) : (
            <button
              onClick={() => requestAnalysis(state.kind === "cached")}
              disabled={state.kind === "loading"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50",
                state.kind === "cached"
                  ? "border border-edge bg-bg-elev2 text-ink hover:bg-bg-elev2/80"
                  : "bg-signal-accent text-white hover:bg-signal-accent/90",
              )}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  state.kind === "loading" && "animate-spin",
                )}
              />
              {state.kind === "loading"
                ? "..."
                : state.kind === "cached"
                  ? "Request refresh"
                  : "Request analysis"}
            </button>
          )}
        </div>
      </div>

      {state.kind === "error" && (
        <div className="mt-4 rounded-md border border-signal-red/40 bg-signal-red/10 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-signal-red">
            <AlertCircle className="h-3.5 w-3.5" />
            Couldn&apos;t request analysis
          </div>
          <div className="mt-1 text-xs text-ink-dim">{state.message}</div>
        </div>
      )}

      {state.kind === "empty" && (
        <div className="mt-4 rounded-md border border-dashed border-edge bg-bg-elev2 p-6 text-center text-sm text-ink-dim">
          Click <strong className="text-ink">Request analysis</strong> to queue{" "}
          {symbol} for the next Cowork analysis pass. The scheduled task picks
          up requests and writes pros/cons using web search for recent news.
        </div>
      )}

      {state.kind === "queued" && (
        <QueuedNotice queuedAt={state.queuedAt} />
      )}

      {state.kind === "cached" && (
        <>
          {state.queuedAt && (
            <div className="mt-4">
              <QueuedNotice queuedAt={state.queuedAt} compact />
            </div>
          )}
          <div className="mt-5 space-y-5">
            {state.data.scores && (
              <ConvictionGauge
                scores={state.data.scores}
                rationales={state.data.rationales}
              />
            )}
            <article className="prose prose-invert prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-h2:text-sm prose-h2:font-semibold prose-h2:uppercase prose-h2:tracking-wider prose-h2:text-ink-dim prose-p:my-2 prose-p:leading-relaxed prose-li:my-1 prose-strong:text-ink">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-signal-blue hover:underline"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {state.data.markdown}
              </ReactMarkdown>
            </article>

            {state.data.sources.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                  Sources ({state.data.sources.length})
                </div>
                <ul className="space-y-1.5">
                  {state.data.sources.map((s, i) => (
                    <li key={s.url + i} className="text-xs">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-signal-blue hover:underline"
                      >
                        <span className="line-clamp-1">{s.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-[11px] text-ink-dim">
              <strong className="text-ink-dim">Not financial advice.</strong>{" "}
              AI-generated commentary based on technical data and news at
              generation time. Verify specific claims, numbers, and quotes
              against the linked sources before acting.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QueuedNotice({
  queuedAt,
  compact = false,
}: {
  queuedAt: string;
  compact?: boolean;
}) {
  const when = new Date(queuedAt);
  const ageMs = Date.now() - when.getTime();
  const ageMin = Math.max(0, Math.floor(ageMs / 60_000));
  const ageStr =
    ageMin < 1
      ? "just now"
      : ageMin < 60
        ? `${ageMin} min ago`
        : ageMin < 60 * 24
          ? `${Math.floor(ageMin / 60)}h ago`
          : when.toLocaleString();

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-signal-amber/30 bg-signal-amber/10 px-3 py-2.5 text-sm",
        compact && "py-2 text-xs",
      )}
    >
      <Clock
        className={cn(
          "shrink-0 text-signal-amber",
          compact ? "mt-0.5 h-3.5 w-3.5" : "mt-0.5 h-4 w-4",
        )}
      />
      <div className="text-ink">
        <div className="font-medium">Queued for next Cowork pass</div>
        <div className={cn("text-ink-dim", compact ? "text-[11px]" : "text-xs")}>
          Requested {ageStr}. The scheduled morning task will pick it up and
          write the analysis. This page auto-refreshes every 15 seconds.
        </div>
      </div>
    </div>
  );
}
