"use client";

import { useMemo, useState } from "react";
import type { EquityCurve, EquityPoint } from "@/lib/types-sim";

interface Props {
  curve: EquityCurve;
  startingCash: number;
  height?: number;
}

export function EquityCurveChart({ curve, startingCash, height = 220 }: Props) {
  const [hover, setHover] = useState<EquityPoint | null>(null);

  const { pathLine, pathArea, baseY, minVal, maxVal, points } = useMemo(() => {
    const pts = curve.points;
    if (pts.length === 0) {
      return {
        pathLine: "",
        pathArea: "",
        baseY: height,
        minVal: 0,
        maxVal: 0,
        points: [] as { x: number; y: number; pt: EquityPoint }[],
      };
    }
    const values = pts.map((p) => p.value).concat([startingCash]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || 1;
    const yMin = min - pad;
    const yMax = max + pad;

    const w = 800; // virtual viewbox width
    const h = height;
    const stepX = pts.length > 1 ? w / (pts.length - 1) : 0;

    const screenY = (v: number) =>
      h - ((v - yMin) / (yMax - yMin)) * (h - 8) - 4;

    const points = pts.map((p, i) => ({
      x: i * stepX,
      y: screenY(p.value),
      pt: p,
    }));

    const line = points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(" ");

    const area =
      points.length > 0
        ? `${line} L ${points[points.length - 1].x} ${h} L 0 ${h} Z`
        : "";

    return {
      pathLine: line,
      pathArea: area,
      baseY: screenY(startingCash),
      minVal: yMin,
      maxVal: yMax,
      points,
    };
  }, [curve, startingCash, height]);

  if (curve.points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-edge bg-bg-elev text-sm text-ink-dim"
        style={{ height }}
      >
        Make a trade to start building the equity curve.
      </div>
    );
  }

  const up = curve.totalReturn >= 0;
  const strokeColor = up ? "#3fb950" : "#f85149";
  const fillColor = up ? "rgba(63,185,80,0.18)" : "rgba(248,81,73,0.18)";

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 800;
    // find nearest point
    let best = points[0];
    let bestD = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    setHover(best?.pt ?? null);
  };

  return (
    <div className="relative rounded-lg border border-edge bg-bg-elev p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs text-ink-dim">
        <span>
          {curve.points[0].date} → {curve.points[curve.points.length - 1].date}
        </span>
        <span>
          {fmt(minVal)} – {fmt(maxVal)}
        </span>
      </div>
      <svg
        viewBox={`0 0 800 ${height}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* baseline = starting cash */}
        <line
          x1={0}
          x2={800}
          y1={baseY}
          y2={baseY}
          stroke="#2a313c"
          strokeDasharray="4 4"
        />
        <path d={pathArea} fill={fillColor} />
        <path d={pathLine} fill="none" stroke={strokeColor} strokeWidth={2} />
        {hover && (
          <>
            {(() => {
              const p = points.find((pp) => pp.pt.date === hover.date);
              if (!p) return null;
              return (
                <>
                  <line
                    x1={p.x}
                    x2={p.x}
                    y1={0}
                    y2={height}
                    stroke="#8b949e"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill={strokeColor}
                    stroke="#0d1117"
                    strokeWidth={2}
                  />
                </>
              );
            })()}
          </>
        )}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs">
          <div className="text-ink-dim">{hover.date}</div>
          <div className="font-semibold text-ink">{fmt(hover.value)}</div>
          <div className="text-[10px] text-ink-dim">
            cash {fmt(hover.cash)} · positions {fmt(hover.positionsValue)}
          </div>
        </div>
      )}
    </div>
  );
}
