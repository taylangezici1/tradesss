import { cn } from "@/lib/utils";

export function Pill({
  tone = "amber",
  children,
  className,
}: {
  tone?: "green" | "red" | "amber" | "blue" | "accent" | "neutral";
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    green: "bg-signal-green/15 text-signal-green",
    red: "bg-signal-red/15 text-signal-red",
    amber: "bg-signal-amber/15 text-signal-amber",
    blue: "bg-signal-blue/15 text-signal-blue",
    accent: "bg-signal-accent/15 text-signal-accent",
    neutral: "bg-bg-elev2 text-ink-dim",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold tabular",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
