import { getPool, ready } from "./db";

export interface WatchlistEntry {
  symbol: string;       // e.g. "AAPL"
  tvTicker: string;     // e.g. "NASDAQ:AAPL"
  name: string;
  note?: string;
  addedAt: string;      // ISO timestamp
}

interface Row {
  symbol: string;
  tv_ticker: string;
  name: string;
  note: string | null;
  added_at: Date;
}

function rowToEntry(r: Row): WatchlistEntry {
  return {
    symbol: r.symbol,
    tvTicker: r.tv_ticker,
    name: r.name,
    note: r.note ?? undefined,
    addedAt: r.added_at.toISOString(),
  };
}

export async function readWatchlist(): Promise<WatchlistEntry[]> {
  await ready();
  const res = await getPool().query<Row>(
    `SELECT symbol, tv_ticker, name, note, added_at
       FROM watchlist
       ORDER BY added_at DESC`,
  );
  return res.rows.map(rowToEntry);
}

/**
 * Replace the entire watchlist with the given list. Used by bulk-import
 * code paths; routine adds/removes should use addToWatchlist /
 * removeFromWatchlist instead.
 */
export async function writeWatchlist(entries: WatchlistEntry[]): Promise<void> {
  await ready();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM watchlist");
    for (const e of entries) {
      await client.query(
        `INSERT INTO watchlist (symbol, tv_ticker, name, note, added_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [e.symbol.toUpperCase(), e.tvTicker, e.name, e.note ?? null, e.addedAt],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function addToWatchlist(
  entry: WatchlistEntry,
): Promise<WatchlistEntry[]> {
  await ready();
  const symU = entry.symbol.toUpperCase();
  await getPool().query(
    `INSERT INTO watchlist (symbol, tv_ticker, name, note, added_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (symbol) DO UPDATE SET
       tv_ticker = EXCLUDED.tv_ticker,
       name      = EXCLUDED.name,
       note      = EXCLUDED.note,
       added_at  = EXCLUDED.added_at`,
    [symU, entry.tvTicker, entry.name, entry.note ?? null, entry.addedAt],
  );
  return readWatchlist();
}

export async function removeFromWatchlist(
  symbol: string,
): Promise<WatchlistEntry[]> {
  await ready();
  await getPool().query(`DELETE FROM watchlist WHERE symbol = $1`, [
    symbol.toUpperCase(),
  ]);
  return readWatchlist();
}
