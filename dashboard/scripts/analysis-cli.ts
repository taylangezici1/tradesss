#!/usr/bin/env tsx
/**
 * Tiny CLI used by the scheduled "tradesss-analyze-stocks" task to talk to
 * Postgres without embedding SQL into the SKILL prompt.
 *
 * Subcommands:
 *
 *   list
 *       Prints a JSON array of pending analysis_queue rows (newest snapshot
 *       fields inlined). Exit 0 even when empty (prints []).
 *
 *   complete <SYMBOL>
 *       Reads a completed-analysis JSON object from stdin, upserts it into
 *       the `analyses` table, then deletes the matching row from
 *       `analysis_queue`. Both happen inside a single transaction so a half-
 *       successful run can't leave a stale queue entry behind.
 *
 * Examples:
 *   npx tsx scripts/analysis-cli.ts list
 *   cat result.json | npx tsx scripts/analysis-cli.ts complete NVDA
 */
import "dotenv/config";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function loadEnvLocal(): void {
  const file = path.join(ROOT, ".env.local");
  try {
    const raw = fs.readFileSync(file, "utf8");
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
loadEnvLocal();

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Add it to dashboard/.env.local before running this CLI.",
  );
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function cmdList(): Promise<void> {
  const res = await pool.query<{
    symbol: string;
    tv_ticker: string;
    name: string;
    requested_at: Date;
    snapshot: unknown;
  }>(
    `SELECT symbol, tv_ticker, name, requested_at, snapshot
       FROM analysis_queue
       ORDER BY requested_at ASC`,
  );
  const out = res.rows.map((r) => ({
    symbol: r.symbol,
    tvTicker: r.tv_ticker,
    name: r.name,
    requestedAt: r.requested_at.toISOString(),
    snapshot: r.snapshot,
  }));
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

interface CompleteInput {
  symbol: string;
  generatedAt?: string;
  model?: string;
  usedWebSearch?: boolean;
  markdown: string;
  sources?: Array<{ title: string; url: string }>;
  scores?: { shortTerm: number; midTerm: number; longTerm: number };
  rationales?: {
    shortTerm: string;
    midTerm: string;
    longTerm: string;
  };
  snapshot: {
    price: number | null;
    change: number | null;
    rsi: number | null;
    rating: number | null;
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
}

async function cmdComplete(symbolArg: string): Promise<void> {
  const symbol = symbolArg.toUpperCase();
  const raw = await readStdin();
  if (!raw.trim()) {
    throw new Error("complete: no JSON received on stdin");
  }
  let payload: CompleteInput;
  try {
    payload = JSON.parse(raw) as CompleteInput;
  } catch (e) {
    throw new Error(
      "complete: stdin is not valid JSON: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
  if (!payload.markdown || !payload.snapshot) {
    throw new Error(
      "complete: payload must include `markdown` and `snapshot` fields",
    );
  }
  const generatedAt = payload.generatedAt ?? new Date().toISOString();
  const model = payload.model ?? "claude-cowork";
  const usedWebSearch = payload.usedWebSearch ?? true;
  const sources = payload.sources ?? [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
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
        symbol,
        generatedAt,
        model,
        usedWebSearch,
        payload.markdown,
        JSON.stringify(sources),
        payload.scores ? JSON.stringify(payload.scores) : null,
        payload.rationales ? JSON.stringify(payload.rationales) : null,
        JSON.stringify(payload.snapshot),
      ],
    );
    await client.query(`DELETE FROM analysis_queue WHERE symbol = $1`, [symbol]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  console.log(`[analysis-cli] wrote analyses[${symbol}] and cleared queue`);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  try {
    if (cmd === "list") {
      await cmdList();
    } else if (cmd === "complete") {
      const sym = rest[0];
      if (!sym) throw new Error("usage: analysis-cli complete <SYMBOL>");
      await cmdComplete(sym);
    } else {
      console.error(
        "usage: analysis-cli <list | complete <SYMBOL>>\n" +
          "  list                 — print pending requests as JSON\n" +
          "  complete <SYMBOL>    — read result JSON from stdin, upsert, dequeue",
      );
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(
      "[analysis-cli] error:",
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
