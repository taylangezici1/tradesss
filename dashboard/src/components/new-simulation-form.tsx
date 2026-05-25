"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

export function NewSimulationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startingCash, setStartingCash] = useState("100000");
  const [commission, setCommission] = useState("0");
  const [slippageBps, setSlippageBps] = useState("0");
  const [maxPositionPct, setMaxPositionPct] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          startingCash: Number(startingCash) || 100000,
          commissionPerTrade: Number(commission) || 0,
          slippageBps: Number(slippageBps) || 0,
          maxPositionPct: maxPositionPct
            ? Number(maxPositionPct)
            : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      router.push(`/simulations/${j.simulation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/simulations"
        className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to simulations
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New simulation
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          Create an isolated paper-trading portfolio. You can run multiple in
          parallel to compare strategies.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Tech Strong Buy strategy"
            className="w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
            required
            maxLength={80}
          />
        </Field>

        <Field
          label="Description"
          hint="Optional — what's the thesis of this simulation?"
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Pick top-3 TV Strong Buy candidates each week, hold 90 days max"
            rows={3}
            maxLength={500}
            className="w-full rounded-md border border-edge bg-bg-elev2 px-3 py-2 text-sm focus:border-signal-accent focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Starting cash" hint="USD" required>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">
                $
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg-elev2 py-2 pl-7 pr-3 text-sm focus:border-signal-accent focus:outline-none"
                required
              />
            </div>
          </Field>

          <Field
            label="Commission per trade"
            hint="Fixed $ cost added to each trade"
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim">
                $
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg-elev2 py-2 pl-7 pr-3 text-sm focus:border-signal-accent focus:outline-none"
              />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Slippage"
            hint="Basis points (100 bps = 1%). Worsens execution price."
          >
            <div className="relative">
              <input
                type="number"
                min={0}
                max={1000}
                step={1}
                value={slippageBps}
                onChange={(e) => setSlippageBps(e.target.value)}
                className="w-full rounded-md border border-edge bg-bg-elev2 py-2 pl-3 pr-12 text-sm focus:border-signal-accent focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-dim">
                bps
              </span>
            </div>
          </Field>

          <Field
            label="Max position size"
            hint="Block buys that would push any position above this % of portfolio"
          >
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={maxPositionPct}
                onChange={(e) => setMaxPositionPct(e.target.value)}
                placeholder="No limit"
                className="w-full rounded-md border border-edge bg-bg-elev2 py-2 pl-3 pr-10 text-sm focus:border-signal-accent focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-dim">
                %
              </span>
            </div>
          </Field>
        </div>

        {error && (
          <div className="rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/simulations"
            className="rounded-md border border-edge bg-bg-elev2 px-4 py-2 text-sm text-ink hover:border-signal-accent"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-signal-accent px-4 py-2 text-sm font-medium text-white hover:bg-signal-accent/90 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create simulation"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-dim">
        {label}
        {required && <span className="ml-0.5 text-signal-red">*</span>}
      </label>
      {children}
      {hint && <div className="mt-1 text-xs text-ink-dim">{hint}</div>}
    </div>
  );
}
