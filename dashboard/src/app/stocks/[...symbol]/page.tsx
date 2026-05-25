import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { resolveTicker } from "@/lib/tradingview";
import {
  fmtMcap,
  fmtNum,
  fmtPct,
  fmtPrice,
  ratingLabel,
  rsiTone,
} from "@/lib/format";
import { Pill } from "@/components/pill";
import { InfoTip } from "@/components/info-tip";
import { StatCard } from "@/components/stat-card";
import {
  TvAdvancedChart,
  TvSymbolInfo,
  TvTechnicalAnalysis,
} from "@/components/tv-widget";
import { WatchlistButton } from "@/components/watchlist-button";
import { AIAnalysis } from "@/components/ai-analysis";
import { TradeButton } from "@/components/trade-button";

export const dynamic = "force-dynamic";

import type { Metadata } from "next";

function joinSymbol(segments: string[]): string {
  return segments.map((s) => decodeURIComponent(s)).join("/").toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: { symbol: string[] };
}): Promise<Metadata> {
  return { title: joinSymbol(params.symbol) };
}

interface PageProps {
  params: { symbol: string[] };
}

function strategyMatches(s: Awaited<ReturnType<typeof resolveTicker>>) {
  const matches: string[] = [];
  if (!s) return matches;
  if ((s.ratingAll ?? 0) >= 0.5) matches.push("TV Strong Buy");
  if (s.rsi !== null && s.rsi < 30) matches.push("Oversold (RSI < 30)");
  if (
    s.close && s.ema20 && s.sma50 && s.sma200 &&
    s.close > s.ema20 && s.ema20 > s.sma50 && s.sma50 > s.sma200 &&
    (s.change ?? 0) > 0
  ) {
    matches.push("Momentum Breakout");
  }
  if (
    s.macd !== null && s.macdSignal !== null &&
    s.macd > s.macdSignal
  ) {
    matches.push("MACD Bullish Cross");
  }
  return matches;
}

export default async function StockPage({ params }: PageProps) {
  const symbol = joinSymbol(params.symbol);
  let stock: Awaited<ReturnType<typeof resolveTicker>> = null;
  let fetchError: string | null = null;

  try {
    stock = await resolveTicker(symbol);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Unknown error";
  }

  if (!stock && !fetchError) notFound();

  if (fetchError) {
    return (
      <div className="space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to scanner
        </Link>
        <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-6">
          <div className="font-semibold text-signal-red">
            Couldn&apos;t reach TradingView
          </div>
          <div className="mt-1 text-xs text-ink-dim">{fetchError}</div>
        </div>
      </div>
    );
  }

  if (!stock) return null;

  const matches = strategyMatches(stock);
  const rating = ratingLabel(stock.ratingAll);
  const changeUp = (stock.change ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to scanner
        </Link>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(stock.tvTicker)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg-elev2 px-3 py-1.5 text-xs font-medium text-ink hover:border-signal-accent"
        >
          Open in TradingView <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {stock.symbol}
            </h1>
            <span className="text-base text-ink-dim">{stock.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
            <Pill tone="neutral">{stock.exchange}</Pill>
            {stock.sector && <span>{stock.sector}</span>}
            {stock.industry && <span>· {stock.industry}</span>}
            {stock.pe && <span>· P/E {stock.pe.toFixed(1)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TradeButton
            symbol={stock.symbol}
            tvTicker={stock.tvTicker}
            name={stock.name}
            currentPrice={stock.close}
          />
          <WatchlistButton
            symbol={stock.symbol}
            tvTicker={stock.tvTicker}
            name={stock.name}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <StatCard
          label="Price"
          infoTerm="price"
          value={fmtPrice(stock.close)}
          hint={
            <span className={changeUp ? "text-signal-green" : "text-signal-red"}>
              {fmtPct(stock.change)} today
            </span>
          }
        />
        <StatCard
          label="TV Rating"
          infoTerm="tv_rating"
          value={
            rating ? (
              <span className="flex items-center gap-2">
                <Pill tone={rating.tone}>{rating.label}</Pill>
                <span className="text-base text-ink-dim">
                  {(stock.ratingAll ?? 0).toFixed(2)}
                </span>
              </span>
            ) : (
              "—"
            )
          }
          hint="Composite of 26 indicators"
        />
        <StatCard
          label="RSI(14)"
          infoTerm="rsi"
          value={
            stock.rsi !== null ? (
              <Pill tone={rsiTone(stock.rsi)}>{stock.rsi.toFixed(1)}</Pill>
            ) : (
              "—"
            )
          }
          hint={
            stock.rsi !== null
              ? stock.rsi < 30
                ? "Oversold"
                : stock.rsi > 70
                  ? "Overbought"
                  : "Neutral"
              : ""
          }
        />
        <StatCard
          label="MACD spread"
          infoTerm="macd_spread"
          value={
            stock.macd !== null && stock.macdSignal !== null
              ? fmtNum(stock.macd - stock.macdSignal, 3)
              : "—"
          }
          tone={
            stock.macd !== null && stock.macdSignal !== null
              ? stock.macd > stock.macdSignal
                ? "green"
                : "red"
              : undefined
          }
          hint={
            stock.macd !== null && stock.macdSignal !== null
              ? stock.macd > stock.macdSignal
                ? "Bullish cross"
                : "Below signal"
              : ""
          }
        />
        <StatCard
          label="Market Cap"
          infoTerm="market_cap"
          value={fmtMcap(stock.marketCap)}
          hint={
            stock.pctFrom52wHigh !== null && stock.pctFrom52wHigh !== undefined
              ? `${fmtPct(stock.pctFrom52wHigh, 1)} from 52w high`
              : ""
          }
        />
      </div>

      <div className="rounded-lg border border-edge bg-bg-elev p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          <span>Strategy signals</span>
          <InfoTip term="strategy_signals" />
        </div>
        {matches.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {matches.map((m) => (
              <Pill key={m} tone="green">
                {m}
              </Pill>
            ))}
          </div>
        ) : (
          <div className="text-sm text-ink-dim">
            No active buy signals from the 4 tracked strategies right now.
          </div>
        )}
      </div>

      <AIAnalysis symbol={stock.symbol} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-dim">
            Chart
          </h2>
          <TvAdvancedChart symbol={stock.tvTicker} height={520} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-dim">
            Technical analysis
          </h2>
          <TvTechnicalAnalysis symbol={stock.tvTicker} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-dim">
          Symbol info
        </h2>
        <TvSymbolInfo symbol={stock.tvTicker} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KV label="EMA(20)" infoTerm="ema20" value={fmtPrice(stock.ema20)} />
        <KV label="SMA(50)" infoTerm="sma50" value={fmtPrice(stock.sma50)} />
        <KV label="SMA(200)" infoTerm="sma200" value={fmtPrice(stock.sma200)} />
        <KV label="Volume" infoTerm="volume" value={fmtNum(stock.volume, 0)} />
        <KV label="10d Avg Volume" infoTerm="avg_volume_10d" value={fmtNum(stock.avgVolume10d, 0)} />
        <KV label="ADX" infoTerm="adx" value={fmtNum(stock.adx, 1)} />
        <KV label="52w High" infoTerm="high52w" value={fmtPrice(stock.high52w)} />
        <KV label="52w Low" infoTerm="low52w" value={fmtPrice(stock.low52w)} />
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  infoTerm,
}: {
  label: string;
  value: React.ReactNode;
  infoTerm?: import("@/lib/glossary").GlossaryTerm;
}) {
  return (
    <div className="rounded-md border border-edge bg-bg-elev px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
        <span>{label}</span>
        {infoTerm && <InfoTip term={infoTerm} />}
      </div>
      <div className="mt-0.5 text-sm tabular">{value}</div>
    </div>
  );
}
