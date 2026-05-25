import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/info-tip";
import type { GlossaryTerm } from "@/lib/glossary";

export function StatCard({
  label,
  value,
  hint,
  tone,
  infoTerm,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "green" | "red" | "amber" | "neutral";
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
          tone === "amber" && "text-signal-amber",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-dim">{hint}</div>}
    </div>
  );
}
