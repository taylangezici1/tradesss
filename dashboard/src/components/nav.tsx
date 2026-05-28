"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BookmarkCheck,
  Briefcase,
  Clock,
  Search,
  Sparkles,
} from "lucide-react";
import { encodeSymbolPath } from "@/lib/format";

export function Nav() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [queueCount, setQueueCount] = useState<number>(0);

  // Poll the analysis queue count every 30s for the badge
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch("/api/analysis-queue", { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          setQueueCount(j.count ?? 0);
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = q.trim().toUpperCase();
    if (sym) {
      router.push(`/stocks/${encodeSymbolPath(sym)}`);
      setQ("");
    }
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-edge bg-bg-elev/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <img src="/icon.svg" alt="Logo" className="h-6 w-6" />
          <span className="font-semibold tracking-tight">tradesss</span>
          <span className="text-xs text-ink-dim">/ scanner</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <NavLink href="/" icon={<Activity className="h-4 w-4" />}>
            Scanner
          </NavLink>
          <NavLink
            href="/watchlist"
            icon={<BookmarkCheck className="h-4 w-4" />}
          >
            Watchlist
          </NavLink>
          <NavLink href="/simulations" icon={<Briefcase className="h-4 w-4" />}>
            Simulations
          </NavLink>
          <NavLink href="/time-sim" icon={<Clock className="h-4 w-4" />}>
            Time Sim
          </NavLink>
          <NavLink href="/analyses" icon={<Sparkles className="h-4 w-4" />}>
            Analyses
          </NavLink>
          {queueCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-signal-amber/15 px-2 py-0.5 text-xs font-medium text-signal-amber"
              title={`${queueCount} stock${queueCount === 1 ? "" : "s"} waiting for the next Cowork analysis pass`}
            >
              <Sparkles className="h-3 w-3" />
              {queueCount} queued
            </span>
          )}
          <form onSubmit={onSubmit} className="ml-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-dim" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Lookup ticker..."
                className="rounded-md border border-edge bg-bg-elev2 py-1.5 pl-7 pr-3 text-xs placeholder:text-ink-dim focus:border-signal-accent focus:outline-none"
              />
            </label>
          </form>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-ink-dim transition-colors hover:bg-bg-elev2 hover:text-ink"
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
