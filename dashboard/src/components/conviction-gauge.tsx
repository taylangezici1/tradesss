"use client";

import { cn } from "@/lib/utils";
import type { ConvictionScores, ConvictionRationales } from "@/lib/analysis-store";

interface Props {
  scores: ConvictionScores;
  rationales?: ConvictionRationales;
}

type Horizon = "shortTerm" | "midTerm" | "longTerm";

const HORIZONS: Array<{ key: Horizon; label: string; window: string }> = [
  { key: "shortTerm", label: "Short term", window: "1-3 months" },
  { key: "midTerm", label: "Mid term", window: "6-12 months" },
  { key: "longTerm", label: "Long term", window: "2-3 years" },
];

function bandFor(score: number): {
  label: string;
  color: string;
  tone: "green" | "amber" | "red";
} {
  if (score >= 80) return { label: "Strong", color: "#3fb950", tone: "green" };
  if (score >= 60) return { label: "Lean buy", color: "#3fb950", tone: "green" };
  if (score >= 40) return { label: "Mixed", color: "#d29922", tone: "amber" };
  if (score >= 20) return { label: "Lean pass", color: "#f85149", tone: "red" };
  return { label: "Pass", color: "#f85149", tone: "red" };
}

function MiniGauge({
  score,
  label,
  window,
  rationale,
  size = 84,
}: {
  score: number;
  label: string;
  window: string;
  rationale?: string;
  size?: number;
}) {
  const s = Math.max(0, Math.min(100, score));
  const band = bandFor(s);
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (s / 100) * c;

  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-edge bg-bg-elev p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      <div className="text-[9px] text-ink-dim -mt-1.5">{window}</div>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#2a313c"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={band.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c}`}
            style={{ transition: "stroke-dasharray 600ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-xl font-bold tabular leading-none"
            style={{ color: band.color }}
          >
            {Math.round(s)}
          </span>
          <span className="text-[8px] uppercase tracking-wider text-ink-dim">
            / 100
          </span>
        </div>
      </div>
      <div
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          band.tone === "green" && "text-signal-green",
          band.tone === "amber" && "text-signal-amber",
          band.tone === "red" && "text-signal-red",
        )}
      >
        {band.label}
      </div>
      {rationale && (
        <p className="text-[11px] leading-relaxed text-ink-dim text-center">
          {rationale}
        </p>
      )}
    </div>
  );
}

export function ConvictionGauge({ scores, rationales }: Props) {
  return (
    <div className="rounded-lg border border-edge bg-bg-elev2 p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
        I would have bought this much
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {HORIZONS.map((h) => (
          <MiniGauge
            key={h.key}
            score={scores[h.key]}
            label={h.label}
            window={h.window}
            rationale={rationales?.[h.key]}
          />
        ))}
      </div>
    </div>
  );
}
