import { promises as fs } from "fs";
import path from "path";
import type { StockRow } from "./types";
import { getPool, ready } from "./db";

/**
 * Pending analysis requests.
 *
 * Source of truth: Postgres (`analysis_queue`). The dashboard ALSO mirrors
 * each request to `data/analysis-queue/{SYMBOL}.json` because the scheduled
 * "tradesss-analyze-stocks" task runs in a sandbox with no network access —
 * it can only see the project's file system. The mirror is one-way: writes
 * go to DB then file; deletes hit file then DB. Reads come from the DB.
 */

export interface AnalysisRequest {
  symbol: string;
  tvTicker: string;
  name: string;
  requestedAt: string;
  // Snapshot of technicals at request time (so the morning task has fresh
  // numbers and doesn't need to re-fetch from TradingView).
  snapshot: {
    price: number | null;
    change: number | null;
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    ema20: number | null;
    sma50: number | null;
    sma200: number | null;
    ratingAll: number | null;
    ratingMA: number | null;
    ratingOsc: number | null;
    stochK: number | null;
    adx: number | null;
    bbUpper: number | null;
    bbLower: number | null;
    high52w: number | null;
    low52w: number | null;
    marketCap: number | null;
    pe: number | null;
    sector: string | null;
    industry: string | null;
    exchange: string;
  };
}

interface QueueRow {
  symbol: string;
  tv_ticker: string;
  name: string;
  requested_at: Date;
  snapshot: AnalysisRequest["snapshot"];
}

function rowToRequest(r: QueueRow): AnalysisRequest {
  return {
    symbol: r.symbol,
    tvTicker: r.tv_ticker,
    name: r.name,
    requestedAt: r.requested_at.toISOString(),
    snapshot: r.snapshot,
  };
}

function queueDir(): string {
  return path.join(process.cwd(), "data", "analysis-queue");
}

function queueFile(symbol: string): string {
  return path.join(queueDir(), `${symbol.toUpperCase()}.json`);
}

async function writeMirrorFile(req: AnalysisRequest): Promise<void> {
  try {
    await fs.mkdir(queueDir(), { recursive: true });
    const tmp = queueFile(req.symbol) + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(req, null, 2), "utf8");
    await fs.rename(tmp, queueFile(req.symbol));
  } catch (err) {
    // Mirror failure shouldn't break enqueue — DB is authoritative.
    console.error("[analysis-queue] failed to write mirror file:", err);
  }
}

async function deleteMirrorFile(symbol: string): Promise<void> {
  try {
    await fs.unlink(queueFile(symbol));
  } catch {
    /* file already gone (or never existed) — fine */
  }
}

export async function enqueue(stock: StockRow): Promise<AnalysisRequest> {
  await ready();
  const req: AnalysisRequest = {
    symbol: stock.symbol.toUpperCase(),
    tvTicker: stock.tvTicker,
    name: stock.name,
    requestedAt: new Date().toISOString(),
    snapshot: {
      price: stock.close,
      change: stock.change,
      rsi: stock.rsi,
      macd: stock.macd,
      macdSignal: stock.macdSignal,
      ema20: stock.ema20,
      sma50: stock.sma50,
      sma200: stock.sma200,
      ratingAll: stock.ratingAll,
      ratingMA: stock.ratingMA,
      ratingOsc: stock.ratingOsc,
      stochK: stock.stochK,
      adx: stock.adx,
      bbUpper: stock.bbUpper,
      bbLower: stock.bbLower,
      high52w: stock.high52w,
      low52w: stock.low52w,
      marketCap: stock.marketCap,
      pe: stock.pe,
      sector: stock.sector,
      industry: stock.industry,
      exchange: stock.exchange,
    },
  };
  await getPool().query(
    `INSERT INTO analysis_queue (symbol, tv_ticker, name, requested_at, snapshot)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (symbol) DO UPDATE SET
       tv_ticker    = EXCLUDED.tv_ticker,
       name         = EXCLUDED.name,
       requested_at = EXCLUDED.requested_at,
       snapshot     = EXCLUDED.snapshot`,
    [
      req.symbol,
      req.tvTicker,
      req.name,
      req.requestedAt,
      JSON.stringify(req.snapshot),
    ],
  );
  await writeMirrorFile(req);
  return req;
}

export async function getRequest(
  symbol: string,
): Promise<AnalysisRequest | null> {
  await ready();
  const res = await getPool().query<QueueRow>(
    `SELECT symbol, tv_ticker, name, requested_at, snapshot
       FROM analysis_queue WHERE symbol = $1`,
    [symbol.toUpperCase()],
  );
  if (res.rowCount === 0) return null;
  return rowToRequest(res.rows[0]);
}

export async function listRequests(): Promise<AnalysisRequest[]> {
  await ready();
  const res = await getPool().query<QueueRow>(
    `SELECT symbol, tv_ticker, name, requested_at, snapshot
       FROM analysis_queue
       ORDER BY requested_at ASC`,
  );
  return res.rows.map(rowToRequest);
}

export async function cancel(symbol: string): Promise<boolean> {
  await ready();
  await deleteMirrorFile(symbol);
  const res = await getPool().query(
    `DELETE FROM analysis_queue WHERE symbol = $1`,
    [symbol.toUpperCase()],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Re-emit every pending DB row as a mirror file. Useful when the queue
 * directory has been wiped (e.g. fresh checkout, or after the scheduled
 * task ran offline). Safe to call repeatedly — files are written via tmp
 * + rename so partial writes can't leak.
 */
export async function rebuildMirror(): Promise<number> {
  const reqs = await listRequests();
  for (const r of reqs) {
    await writeMirrorFile(r);
  }
  return reqs.length;
}
