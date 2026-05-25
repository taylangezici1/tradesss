"use client";

import type { AutoRules } from "@/lib/types-sim";

/**
 * Form fields for the AutoRules config — used both at sim creation and in
 * the edit panel on the sim detail page. Kept as a controlled component
 * (parent owns state) so the same shape works in either place.
 */
export type AutoRulesDraft = Omit<AutoRules, "universe">;

export function AutoRulesFields({
  value,
  onChange,
}: {
  value: AutoRulesDraft;
  onChange: (next: AutoRulesDraft) => void;
}) {
  const set = <K extends keyof AutoRulesDraft>(
    key: K,
    v: AutoRulesDraft[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5">
      {/* Exit triggers */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          Exit triggers
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <NumberField
            label="Stop loss"
            suffix="%"
            sign="-"
            min={0.5}
            max={50}
            step={0.5}
            value={value.stopLossPct}
            onChange={(n) => set("stopLossPct", n)}
            hint="Sell when down this % from avg cost"
          />
          <NumberField
            label="Take profit"
            suffix="%"
            sign="+"
            min={0.5}
            max={200}
            step={0.5}
            value={value.takeProfitPct}
            onChange={(n) => set("takeProfitPct", n)}
            hint="Sell when up this % from avg cost"
          />
        </div>
      </div>

      <RadioGroup
        label="Which positions follow these rules?"
        value={value.ruleScope}
        onChange={(v) => set("ruleScope", v as AutoRulesDraft["ruleScope"])}
        options={[
          {
            value: "auto_only",
            label: "Only auto-bought positions",
            hint: "Your manual swing trades stay untouched by SL/TP",
          },
          {
            value: "all",
            label: "All positions (manual + auto)",
            hint: "Manual buys also get sold when they hit the thresholds",
          },
        ]}
      />

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          Reinvest cash into top pick from
        </div>
        <select
          value={value.reinvestStrategy}
          onChange={(e) =>
            set(
              "reinvestStrategy",
              e.target.value as AutoRulesDraft["reinvestStrategy"],
            )
          }
          className="mt-1 w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
        >
          <option value="oversold">Oversold (RSI &lt; 30)</option>
          <option value="breakout">Momentum Breakout</option>
          <option value="macd_cross">MACD Bullish Cross</option>
        </select>
        <p className="mt-1 text-xs text-ink-dim">
          On a sell day the engine scans the S&amp;P 500 and buys the
          top-ranked match.
        </p>
      </div>

      <RadioGroup
        label="If top pick is already held"
        value={value.duplicateHandling}
        onChange={(v) =>
          set("duplicateHandling", v as AutoRulesDraft["duplicateHandling"])
        }
        options={[
          {
            value: "skip_to_next",
            label: "Skip to next-ranked",
            hint: "Walks down the list until it finds a name you don't hold",
          },
          {
            value: "pyramid",
            label: "Add to existing position",
            hint: "Compounds conviction but concentrates risk",
          },
          {
            value: "hold_cash",
            label: "Hold cash this day",
            hint: "Sits out — re-checks on the next sell event",
          },
        ]}
      />

      <RadioGroup
        label="If nothing matches today's strategy"
        value={value.noMatchBehavior}
        onChange={(v) =>
          set("noMatchBehavior", v as AutoRulesDraft["noMatchBehavior"])
        }
        options={[
          {
            value: "hold_cash",
            label: "Hold cash, recheck next day",
            hint: "Wait for a real signal — may sit on cash for stretches",
          },
          {
            value: "relax_threshold",
            label: "Buy best partial match",
            hint: "Always deploy cash, even if no name clears the bar",
          },
        ]}
      />

      <div className="rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-xs text-ink-dim">
        Universe: <span className="text-ink">S&amp;P 500</span> (fixed in
        this version)
      </div>
    </div>
  );
}

function NumberField({
  label,
  suffix,
  sign,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: {
  label: string;
  suffix: string;
  sign?: "+" | "-";
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
        {label}
      </label>
      <div className="relative mt-1">
        {sign && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">
            {sign}
          </span>
        )}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={
            "w-full rounded-md border border-edge bg-bg-elev2 py-2 pr-8 text-sm focus:border-signal-accent focus:outline-none " +
            (sign ? "pl-7" : "pl-3")
          }
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-dim">
          {suffix}
        </span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-ink-dim">{hint}</p>}
    </div>
  );
}

function RadioGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; hint?: string }>;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      <div className="mt-2 space-y-1.5">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={
              "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors " +
              (value === opt.value
                ? "border-signal-accent bg-signal-accent/5"
                : "border-edge bg-bg-elev2 hover:border-signal-accent/60")
            }
          >
            <input
              type="radio"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-1 h-3.5 w-3.5 accent-signal-accent"
            />
            <div className="min-w-0">
              <div className="text-sm">{opt.label}</div>
              {opt.hint && (
                <div className="text-[11px] text-ink-dim">{opt.hint}</div>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
