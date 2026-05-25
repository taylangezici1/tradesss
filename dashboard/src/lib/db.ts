/**
 * Postgres connection pool + schema bootstrap.
 *
 * Single shared `pg.Pool` instance for the whole app. Schema is created
 * lazily on first call to `getPool()` so dev/prod don't need a separate
 * migration step for the table layout (the data migration is a separate
 * one-shot script in scripts/migrate-data.ts).
 *
 * Connection string comes from `process.env.DATABASE_URL`, e.g.
 *   postgresql://postgres:1@localhost:5432/tradesss
 */
import { Pool, type PoolClient } from "pg";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS analyses (
  id               BIGSERIAL PRIMARY KEY,
  symbol           TEXT NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL,
  model            TEXT NOT NULL,
  used_web_search  BOOLEAN NOT NULL,
  markdown         TEXT NOT NULL,
  sources          JSONB NOT NULL DEFAULT '[]'::jsonb,
  scores           JSONB,
  rationales       JSONB,
  snapshot         JSONB NOT NULL
);
-- Migration: older deployments had \`symbol\` as the PK, which caused new
-- analyses to overwrite older ones. We now keep full history keyed by id.
DO $analyses_pk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN id BIGSERIAL;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'analyses'::regclass
      AND i.indisprimary
      AND a.attname = 'symbol'
  ) THEN
    ALTER TABLE analyses DROP CONSTRAINT analyses_pkey;
    ALTER TABLE analyses ADD PRIMARY KEY (id);
  END IF;
END
$analyses_pk$;
CREATE INDEX IF NOT EXISTS analyses_symbol_generated_idx
  ON analyses (symbol, generated_at DESC);

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
-- Migration: scenario start date. Backfills to created_at::date for
-- pre-existing rows so the slider has a sensible lower bound on old sims.
ALTER TABLE time_simulations ADD COLUMN IF NOT EXISTS start_date DATE;
UPDATE time_simulations SET start_date = created_at::date WHERE start_date IS NULL;
-- Migration: auto-trading rule configuration (stop loss / take profit /
-- reinvest strategy). NULL means no auto-rules attached.
ALTER TABLE time_simulations ADD COLUMN IF NOT EXISTS auto_rules JSONB;

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

let _pool: Pool | null = null;
let _initPromise: Promise<void> | null = null;

function buildPool(): Pool {
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local, e.g. " +
        "postgresql://postgres:1@localhost:5432/tradesss",
    );
  }
  const pool = new Pool({
    connectionString: cs,
    // Reasonable defaults for a single-host dev DB.
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    // Don't crash the server when an idle client errors.
    console.error("[db] idle client error:", err);
  });
  return pool;
}

async function initSchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}

/**
 * Returns the shared pool, creating it (and running schema init) on first call.
 * Safe to call from any handler — init only runs once per process.
 */
export function getPool(): Pool {
  if (!_pool) {
    _pool = buildPool();
    _initPromise = initSchema(_pool).catch((err) => {
      console.error("[db] schema init failed:", err);
      throw err;
    });
  }
  return _pool;
}

/**
 * Awaits any in-flight schema init. Call this before issuing the first query
 * in a handler so we don't race on a fresh process.
 */
export async function ready(): Promise<void> {
  getPool();
  if (_initPromise) await _initPromise;
}

/**
 * Run a function inside a transaction. Rolls back on throw.
 */
export async function withTx<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
