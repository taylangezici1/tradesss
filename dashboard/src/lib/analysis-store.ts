import { promises as fs } from "fs";
import path from "path";
import { getPool, ready, withTx } from "./db";

/**
 * Three-horizon conviction score. Each value is an integer 0-100
 * representing "of fresh capital I were deploying, how much would I put
 * into a BUY here for THAT horizon" — same scale, different time frame.
 */
export interface ConvictionScores {
  shortTerm: number;
  midTerm: number;
  longTerm: number;
}

export interface ConvictionRationales {
  shortTerm: string;
  midTerm: string;
  longTerm: string;
}

export interface StockAnalysis {
  symbol: string;
  generatedAt: string;
  model: string;
  usedWebSearch: boolean;
  markdown: string;
  sources: Array<{ title: string; url: string }>;
  scores?: ConvictionScores;
  rationales?: ConvictionRationales;
  snapshot: {
    price: number | null;
    change: number | null;
    rsi: number | null;
    rating: number | null;
  };
}

export interface AnalysisSummary {
  id: number;
  symbol: string;
  generatedAt: string;
  model: string;
  usedWebSearch: boolean;
  scores?: ConvictionScores;
  rationales?: ConvictionRationales;
  snapshot: StockAnalysis["snapshot"];
}

interface AnalysisRow {
  id: number;
  symbol: string;
  generated_at: Date;
  model: string;
  used_web_search: boolean;
  markdown: string;
  sources: Array<{ title: string; url: string }>;
  scores: ConvictionScores | null;
  rationales: ConvictionRationales | null;
  snapshot: StockAnalysis["snapshot"];
}

function rowToAnalysis(r: AnalysisRow): StockAnalysis {
  return {
    symbol: r.symbol,
    generatedAt: r.generated_at.toISOString(),
    model: r.model,
    usedWebSearch: r.used_web_search,
    markdown: r.markdown,
    sources: r.sources ?? [],
    scores: r.scores ?? undefined,
    rationales: r.rationales ?? undefined,
    snapshot: r.snapshot,
  };
}

/* -------------------------- file-bridge ingestion ------------------------- */
/*
 * The scheduled "tradesss-analyze-stocks" task runs in a sandbox with no
 * network access — it can only do file I/O. It writes results to
 * `data/analyses/{SYMBOL}.json` and removes the matching queue file. The
 * dashboard then drains those files into Postgres on every read.
 *
 * `syncFromFiles()` is safe to call concurrently: the upsert + queue-delete
 * + file-unlink happens in a transaction, and `fs.rename` is used by the
 * scheduled task to avoid us reading a half-written file. We also skip
 * files modified within the last 250 ms as a belt-and-braces guard.
 */

const STALE_MS = 250;

function analysesDir(): string {
  return path.join(process.cwd(), "data", "analyses");
}

let _syncInFlight: Promise<number> | null = null;

export async function syncFromFiles(): Promise<number> {
  if (_syncInFlight) return _syncInFlight;
  _syncInFlight = (async (): Promise<number> => {
    let imported = 0;
    let files: string[];
    try {
      files = await fs.readdir(analysesDir());
    } catch {
      return 0; // no directory yet — nothing to ingest
    }
    const now = Date.now();
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const full = path.join(analysesDir(), f);
      try {
        const stat = await fs.stat(full);
        if (now - stat.mtimeMs < STALE_MS) continue; // still being written
        const raw = await fs.readFile(full, "utf8");
        const a = JSON.parse(raw) as StockAnalysis;
        if (!a?.symbol || !a?.markdown || !a?.snapshot) continue;
        await ingestOne(a);
        await fs.unlink(full).catch(() => {});
        imported++;
      } catch (err) {
        console.error(`[analysis-store] failed to ingest ${f}:`, err);
      }
    }
    return imported;
  })();
  try {
    return await _syncInFlight;
  } finally {
    _syncInFlight = null;
  }
}

async function ingestOne(a: StockAnalysis): Promise<void> {
  await withTx(async (client) => {
    // Append-only: every ingested file becomes a new row so historical
    // analyses for the same symbol stay readable.
    await client.query(
      `INSERT INTO analyses
         (symbol, generated_at, model, used_web_search, markdown,
          sources, scores, rationales, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)`,
      [
        a.symbol.toUpperCase(),
        a.generatedAt,
        a.model,
        a.usedWebSearch,
        a.markdown,
        JSON.stringify(a.sources ?? []),
        a.scores ? JSON.stringify(a.scores) : null,
        a.rationales ? JSON.stringify(a.rationales) : null,
        JSON.stringify(a.snapshot),
      ],
    );
    // The scheduled task is supposed to delete the queue file itself, but
    // remove the corresponding DB row defensively in case it didn't.
    await client.query(`DELETE FROM analysis_queue WHERE symbol = $1`, [
      a.symbol.toUpperCase(),
    ]);
  });
}

/* ------------------------------- public API ------------------------------- */

export async function readAnalysis(
  symbol: string,
): Promise<StockAnalysis | null> {
  await ready();
  await syncFromFiles();
  const res = await getPool().query<AnalysisRow>(
    `SELECT id, symbol, generated_at, model, used_web_search, markdown,
            sources, scores, rationales, snapshot
       FROM analyses
       WHERE symbol = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
    [symbol.toUpperCase()],
  );
  if (res.rowCount === 0) return null;
  return rowToAnalysis(res.rows[0]);
}

export async function writeAnalysis(a: StockAnalysis): Promise<void> {
  await ready();
  await getPool().query(
    `INSERT INTO analyses
       (symbol, generated_at, model, used_web_search, markdown,
        sources, scores, rationales, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)`,
    [
      a.symbol.toUpperCase(),
      a.generatedAt,
      a.model,
      a.usedWebSearch,
      a.markdown,
      JSON.stringify(a.sources ?? []),
      a.scores ? JSON.stringify(a.scores) : null,
      a.rationales ? JSON.stringify(a.rationales) : null,
      JSON.stringify(a.snapshot),
    ],
  );
}

export async function listAnalyses(): Promise<AnalysisSummary[]> {
  await ready();
  await syncFromFiles();
  const res = await getPool().query<Omit<AnalysisRow, "markdown" | "sources">>(
    `SELECT id, symbol, generated_at, model, used_web_search,
            scores, rationales, snapshot
       FROM analyses
       ORDER BY generated_at DESC, id DESC`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    generatedAt: r.generated_at.toISOString(),
    model: r.model,
    usedWebSearch: r.used_web_search,
    scores: r.scores ?? undefined,
    rationales: r.rationales ?? undefined,
    snapshot: r.snapshot,
  }));
}
