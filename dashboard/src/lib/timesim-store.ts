import type { AutoRules, Simulation, Trade, Side } from "./types-sim";
import { getPool, ready, withTx } from "./db";
import type { PoolClient } from "pg";

/**
 * Time-aware simulations live in their own table so they stay completely
 * isolated from the regular live-paper-trading simulations. The shape is
 * identical to a regular Simulation — the only difference is that trades
 * may have backdated timestamps and valuation is done "as of" a chosen date
 * using historical closes from Yahoo.
 */

interface SimRow {
  id: string;
  name: string;
  description: string | null;
  starting_cash: number;
  commission_per_trade: number;
  slippage_bps: number;
  max_position_pct: number | null;
  created_at: Date;
  start_date: Date | null;
  auto_rules: AutoRules | null;
}

interface TradeRow {
  id: string;
  time_simulation_id: string;
  position: number;
  symbol: string;
  tv_ticker: string;
  side: string;
  shares: number;
  price: number;
  commission: number;
  slippage: number;
  ts: Date;
  note: string | null;
}

function rowToTrade(r: TradeRow): Trade {
  return {
    id: r.id,
    symbol: r.symbol,
    tvTicker: r.tv_ticker,
    side: r.side as Side,
    shares: Number(r.shares),
    price: Number(r.price),
    commission: Number(r.commission),
    slippage: Number(r.slippage),
    timestamp: r.ts.toISOString(),
    note: r.note ?? undefined,
  };
}

function dateOnly(d: Date): string {
  // Postgres DATE columns come back as Date at UTC midnight; render YYYY-MM-DD
  // without timezone shenanigans.
  return (
    d.getUTCFullYear() +
    "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

function rowToSim(s: SimRow, trades: Trade[]): Simulation {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? undefined,
    startingCash: Number(s.starting_cash),
    commissionPerTrade: Number(s.commission_per_trade),
    slippageBps: Number(s.slippage_bps),
    maxPositionPct:
      s.max_position_pct === null ? undefined : Number(s.max_position_pct),
    createdAt: s.created_at.toISOString(),
    startDate: s.start_date ? dateOnly(s.start_date) : undefined,
    autoRules: s.auto_rules ?? undefined,
    trades,
  };
}

export async function readAll(): Promise<Simulation[]> {
  await ready();
  const pool = getPool();
  const sims = await pool.query<SimRow>(
    `SELECT id, name, description, starting_cash, commission_per_trade,
            slippage_bps, max_position_pct, created_at, start_date, auto_rules
       FROM time_simulations`,
  );
  if (sims.rowCount === 0) return [];
  const trades = await pool.query<TradeRow>(
    `SELECT id, time_simulation_id, position, symbol, tv_ticker, side,
            shares, price, commission, slippage, ts, note
       FROM time_sim_trades
       ORDER BY time_simulation_id, position`,
  );
  const tradesBySim = new Map<string, Trade[]>();
  for (const t of trades.rows) {
    const list = tradesBySim.get(t.time_simulation_id) ?? [];
    list.push(rowToTrade(t));
    tradesBySim.set(t.time_simulation_id, list);
  }
  return sims.rows.map((s) => rowToSim(s, tradesBySim.get(s.id) ?? []));
}

export async function readOne(id: string): Promise<Simulation | null> {
  await ready();
  const pool = getPool();
  const sims = await pool.query<SimRow>(
    `SELECT id, name, description, starting_cash, commission_per_trade,
            slippage_bps, max_position_pct, created_at, start_date, auto_rules
       FROM time_simulations WHERE id = $1`,
    [id],
  );
  if (sims.rowCount === 0) return null;
  const trades = await pool.query<TradeRow>(
    `SELECT id, time_simulation_id, position, symbol, tv_ticker, side,
            shares, price, commission, slippage, ts, note
       FROM time_sim_trades WHERE time_simulation_id = $1
       ORDER BY position`,
    [id],
  );
  return rowToSim(sims.rows[0], trades.rows.map(rowToTrade));
}

async function upsertSimMeta(
  client: PoolClient,
  sim: Simulation,
): Promise<void> {
  await client.query(
    `INSERT INTO time_simulations
       (id, name, description, starting_cash, commission_per_trade,
        slippage_bps, max_position_pct, created_at, start_date, auto_rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name                 = EXCLUDED.name,
       description          = EXCLUDED.description,
       starting_cash        = EXCLUDED.starting_cash,
       commission_per_trade = EXCLUDED.commission_per_trade,
       slippage_bps         = EXCLUDED.slippage_bps,
       max_position_pct     = EXCLUDED.max_position_pct,
       created_at           = EXCLUDED.created_at,
       start_date           = EXCLUDED.start_date,
       auto_rules           = EXCLUDED.auto_rules`,
    [
      sim.id,
      sim.name,
      sim.description ?? null,
      sim.startingCash,
      sim.commissionPerTrade,
      sim.slippageBps,
      sim.maxPositionPct ?? null,
      sim.createdAt,
      sim.startDate ?? null,
      sim.autoRules ? JSON.stringify(sim.autoRules) : null,
    ],
  );
}

async function replaceTrades(
  client: PoolClient,
  simId: string,
  trades: Trade[],
): Promise<void> {
  await client.query(
    `DELETE FROM time_sim_trades WHERE time_simulation_id = $1`,
    [simId],
  );
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    await client.query(
      `INSERT INTO time_sim_trades
         (id, time_simulation_id, position, symbol, tv_ticker, side,
          shares, price, commission, slippage, ts, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        t.id,
        simId,
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
  }
}

export async function upsertOne(sim: Simulation): Promise<void> {
  await withTx(async (client) => {
    await upsertSimMeta(client, sim);
    await replaceTrades(client, sim.id, sim.trades ?? []);
  });
}

export async function writeAll(sims: Simulation[]): Promise<void> {
  await withTx(async (client) => {
    await client.query(`DELETE FROM time_simulations`);
    for (const sim of sims) {
      await upsertSimMeta(client, sim);
      await replaceTrades(client, sim.id, sim.trades ?? []);
    }
  });
}

export async function deleteOne(id: string): Promise<boolean> {
  await ready();
  const res = await getPool().query(
    `DELETE FROM time_simulations WHERE id = $1`,
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}

export function makeId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "tsim";
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${slug}-${rnd}`;
}

export function makeTradeId(): string {
  return (
    "t-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}
