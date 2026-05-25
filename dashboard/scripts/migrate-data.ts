#!/usr/bin/env tsx
/**
 * One-shot migration: read all data files under `dashboard/data/` and load
 * them into Postgres. Idempotent — re-running the script will upsert rows
 * by primary key (symbol / sim id / trade id), so it's safe to run again
 * after a failed partial run.
 *
 * Usage (from the dashboard/ directory):
 *
 *     npm install
 *     npm run migrate-data
 *
 * Reads DATABASE_URL from `.env.local` (falling back to `.env`).
 */
import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { Pool } from "pg";

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

// --------------------------------------------------------------------------
// Shared connection
// --------------------------------------------------------------------------

function loadEnv(): void {
  // dotenv/config already auto-loaded `.env`. Also try `.env.local` (Next.js's
  // canonical local override) without clobbering anything already set.
  const localPath = path.join(ROOT, ".env.local");
  try {
    const raw = require("fs").readFileSync(localPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k]) continue;
      let v = vRaw;
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  } catch {
    /* no .env.local — fine */
  }
}

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Add it to dashboard/.env.local, e.g.\n  " +
      "DATABASE_URL=postgresql://postgres:1@localhost:5432/tradesss",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --------------------------------------------------------------------------
// Schema (mirrors src/lib/db.ts — kept inline so the script can run
// standalone with `tsx` without resolving Next aliases)
// --------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS analyses (
  symbol           TEXT PRIMARY KEY,
  generated_at     TIMESTAMPTZ NOT NULL,
  model            TEXT NOT NULL,
  used_web_search  BOOLEAN NOT NULL,
  markdown         TEXT NOT NULL,
  sources          JSONB NOT NULL DEFAULT '[]'::jsonb,
  scores           JSONB,
  rationales       JSONB,
  snapshot         JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_queue (
  symbol        TEXT PRIMARY KEY,
  tv_ticker     TEXT NOT NULL,
  name          TEXT NOT NULL,
  requested_at  TIMESTAMPTZ NOT NULL,
  snapshot      JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS simulations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  starting_cash         DOUBLE PRECISION NOT NULL,
  commission_per_trade  DOUBLE PRECISION NOT NULL,
  slippage_bps          DOUBLE PRECISION NOT NULL,
  max_position_pct      DOUBLE PRECISION,
  created_at            TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sim_trades (
  id             TEXT PRIMARY KEY,
  simulation_id  TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  symbol         TEXT NOT NULL,
  tv_ticker      TEXT NOT NULL,
  side           TEXT NOT NULL,
  shares         DOUBLE PRECISION NOT NULL,
  price          DOUBLE PRECISION NOT NULL,
  commission     DOUBLE PRECISION NOT NULL,
  slippage       DOUBLE PRECISION NOT NULL,
  ts             TIMESTAMPTZ NOT NULL,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS sim_trades_sim_pos_idx
  ON sim_trades (simulation_id, position);

CREATE TABLE IF NOT EXISTS time_simulations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  starting_cash         DOUBLE PRECISION NOT NULL,
  commission_per_trade  DOUBLE PRECISION NOT NULL,
  slippage_bps          DOUBLE PRECISION NOT NULL,
  max_position_pct      DOUBLE PRECISION,
  created_at            TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS time_sim_trades (
  id                  TEXT PRIMARY KEY,
  time_simulation_id  TEXT NOT NULL REFERENCES time_simulations(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  symbol              TEXT NOT NULL,
  tv_ticker           TEXT NOT NULL,
  side                TEXT NOT NULL,
  shares              DOUBLE PRECISION NOT NULL,
  price               DOUBLE PRECISION NOT NULL,
  commission          DOUBLE PRECISION NOT NULL,
  slippage            DOUBLE PRECISION NOT NULL,
  ts                  TIMESTAMPTZ NOT NULL,
  note                TEXT
);
CREATE INDEX IF NOT EXISTS time_sim_trades_sim_pos_idx
  ON time_sim_trades (time_simulation_id, position);

CREATE TABLE IF NOT EXISTS watchlist (
  symbol     TEXT PRIMARY KEY,
  tv_ticker  TEXT NOT NULL,
  name       TEXT NOT NULL,
  note       TEXT,
  added_at   TIMESTAMPTZ NOT NULL
);
`;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function listJson(dir: string): Promise<string[]> {
  try {
    const all = await fs.readdir(dir);
    return all.filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// Migrators
// --------------------------------------------------------------------------

interface RawAnalysis {
  symbol: string;
  generatedAt: string;
  model: string;
  usedWebSearch: boolean;
  markdown: string;
  sources?: Array<{ title: string; url: string }>;
  scores?: { shortTerm: number; midTerm: number; longTerm: number };
  rationales?: { shortTerm: string; midTerm: string; longTerm: string };
  snapshot: {
    price: number | null;
    change: number | null;
    rsi: number | null;
    rating: number | null;
  };
}

async function migrateAnalyses(): Promise<number> {
  const dir = path.join(DATA, "analyses");
  const files = await listJson(dir);
  let n = 0;
  for (const f of files) {
    const a = await readJson<RawAnalysis>(f);
    if (!a || !a.symbol) continue;
    await pool.query(
      `INSERT INTO analyses
         (symbol, generated_at, model, used_web_search, markdown,
          sources, scores, rationales, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)
       ON CONFLICT (symbol) DO UPDATE SET
         generated_at    = EXCLUDED.generated_at,
         model           = EXCLUDED.model,
         used_web_search = EXCLUDED.used_web_search,
         markdown        = EXCLUDED.markdown,
         sources         = EXCLUDED.sources,
         scores          = EXCLUDED.scores,
         rationales      = EXCLUDED.rationales,
         snapshot        = EXCLUDED.snapshot`,
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
    n++;
  }
  return n;
}

interface RawQueueReq {
  symbol: string;
  tvTicker: string;
  name: string;
  requestedAt: string;
  snapshot: unknown;
}

async function migrateAnalysisQueue(): Promise<number> {
  const dir = path.join(DATA, "analysis-queue");
  const files = await listJson(dir);
  let n = 0;
  for (const f of files) {
    const r = await readJson<RawQueueReq>(f);
    if (!r || !r.symbol) continue;
    await pool.query(
      `INSERT INTO analysis_queue (symbol, tv_ticker, name, requested_at, snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (symbol) DO UPDATE SET
         tv_ticker    = EXCLUDED.tv_ticker,
         name         = EXCLUDED.name,
         requested_at = EXCLUDED.requested_at,
         snapshot     = EXCLUDED.snapshot`,
      [
        r.symbol.toUpperCase(),
        r.tvTicker,
        r.name,
        r.requestedAt,
        JSON.stringify(r.snapshot ?? {}),
      ],
    );
    n++;
  }
  return n;
}

interface RawTrade {
  id: string;
  symbol: string;
  tvTicker: string;
  side: "BUY" | "SELL";
  shares: number;
  price: number;
  commission: number;
  slippage: number;
  timestamp: string;
  note?: string;
}

interface RawSim {
  id: string;
  name: string;
  description?: string;
  startingCash: number;
  commissionPerTrade: number;
  slippageBps: number;
  maxPositionPct?: number;
  createdAt: string;
  trades?: RawTrade[];
}

async function migrateSimulations(
  file: string,
  simTable: string,
  tradeTable: string,
  fkColumn: string,
): Promise<{ sims: number; trades: number }> {
  const list = await readJson<RawSim[]>(file);
  if (!Array.isArray(list)) return { sims: 0, trades: 0 };
  let sims = 0;
  let trades = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sim of list) {
      if (!sim?.id) continue;
      await client.query(
        `INSERT INTO ${simTable}
           (id, name, description, starting_cash, commission_per_trade,
            slippage_bps, max_position_pct, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name                 = EXCLUDED.name,
           description          = EXCLUDED.description,
           starting_cash        = EXCLUDED.starting_cash,
           commission_per_trade = EXCLUDED.commission_per_trade,
           slippage_bps         = EXCLUDED.slippage_bps,
           max_position_pct     = EXCLUDED.max_position_pct,
           created_at           = EXCLUDED.created_at`,
        [
          sim.id,
          sim.name,
          sim.description ?? null,
          sim.startingCash,
          sim.commissionPerTrade,
          sim.slippageBps,
          sim.maxPositionPct ?? null,
          sim.createdAt,
        ],
      );
      sims++;

      // Replace trades for this sim so re-runs converge.
      await client.query(
        `DELETE FROM ${tradeTable} WHERE ${fkColumn} = $1`,
        [sim.id],
      );
      const tradeList = sim.trades ?? [];
      for (let i = 0; i < tradeList.length; i++) {
        const t = tradeList[i];
        await client.query(
          `INSERT INTO ${tradeTable}
             (id, ${fkColumn}, position, symbol, tv_ticker, side,
              shares, price, commission, slippage, ts, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            t.id,
            sim.id,
            i,
            t.symbol,
            t.tvTicker,
            t.side,
            t.shares,
            t.price,
            t.commission,
            t.slippage,
            t.timestamp,
            t.note ?? null,
          ],
        );
        trades++;
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { sims, trades };
}

interface RawWatchlist {
  symbol: string;
  tvTicker: string;
  name: string;
  note?: string;
  addedAt: string;
}

async function migrateWatchlist(): Promise<number> {
  const file = path.join(DATA, "watchlist.json");
  const list = await readJson<RawWatchlist[]>(file);
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const e of list) {
    if (!e?.symbol) continue;
    await pool.query(
      `INSERT INTO watchlist (symbol, tv_ticker, name, note, added_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (symbol) DO UPDATE SET
         tv_ticker = EXCLUDED.tv_ticker,
         name      = EXCLUDED.name,
         note      = EXCLUDED.note,
         added_at  = EXCLUDED.added_at`,
      [e.symbol.toUpperCase(), e.tvTicker, e.name, e.note ?? null, e.addedAt],
    );
    n++;
  }
  return n;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[migrate] connecting to ${maskedUrl()}`);
  await pool.query(SCHEMA_SQL);
  console.log("[migrate] schema ensured");

  const analyses = await migrateAnalyses();
  console.log(`[migrate] analyses:        ${analyses} rows`);

  const queue = await migrateAnalysisQueue();
  console.log(`[migrate] analysis_queue:  ${queue} rows`);

  const sims = await migrateSimulations(
    path.join(DATA, "simulations.json"),
    "simulations",
    "sim_trades",
    "simulation_id",
  );
  console.log(
    `[migrate] simulations:     ${sims.sims} sims / ${sims.trades} trades`,
  );

  const tsims = await migrateSimulations(
    path.join(DATA, "time-simulations.json"),
    "time_simulations",
    "time_sim_trades",
    "time_simulation_id",
  );
  console.log(
    `[migrate] time_simulations: ${tsims.sims} sims / ${tsims.trades} trades`,
  );

  const watch = await migrateWatchlist();
  console.log(`[migrate] watchlist:        ${watch} rows`);

  console.log("[migrate] done.");
}

function maskedUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  return url.replace(/:[^:@/]+@/, ":***@");
}

main()
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
