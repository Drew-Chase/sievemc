import Database from "@tauri-apps/plugin-sql";
import type {Side} from "./sieve.ts";

/**
 * Persistent store for per-mod side overrides, backed by the Tauri SQLite plugin
 * (`sqlite:sieve.db`, table created via the Rust-side migration in `lib.rs`).
 *
 * Overrides are keyed by a mod's stable manifest id so a user's choice is
 * remembered across scans, mod versions, and app restarts. SQLite keeps this
 * portable and fast to query even for large mod collections.
 *
 * The DB API is async, but the wizard reducer needs synchronous reads when a
 * scan completes, so we keep an in-memory mirror (`cache`) hydrated once at
 * startup and read from it; writes update the mirror immediately and persist to
 * SQLite in the background.
 */

const DB_URL = "sqlite:sieve.db";

let db: Database | null = null;
/** In-memory mirror of the persisted mod-id → side overrides, for sync reads. */
const cache = new Map<string, Side>();
let ready: Promise<void> | null = null;

/** Row shape returned by the `SELECT` below. */
type OverrideRow = {mod_id: string; side: Side};

/**
 * Open the database and hydrate the in-memory cache. Idempotent — safe to call
 * from every provider mount; only the first call does the work.
 */
export function initOverrideStore(): Promise<void>
{
    if (!ready)
    {
        ready = (async () =>
        {
            try
            {
                db = await Database.load(DB_URL);
                const rows = await db.select<OverrideRow[]>("SELECT mod_id, side FROM overrides");
                for (const row of rows) cache.set(row.mod_id, row.side);
            } catch (e)
            {
                console.error("Failed to load override store:", e);
            }
        })();
    }
    return ready;
}

/** Synchronously read a remembered override from the in-memory cache. */
export function rememberedSide(modId: string): Side | undefined
{
    return cache.get(modId);
}

/** Upsert an override, updating the cache immediately and SQLite in the background. */
export function rememberOverride(modId: string, side: Side): void
{
    cache.set(modId, side);
    void db?.execute(
        "INSERT INTO overrides (mod_id, side) VALUES ($1, $2) " +
        "ON CONFLICT(mod_id) DO UPDATE SET side = $2, updated_at = strftime('%s', 'now')",
        [modId, side]
    ).catch(e => console.error("Failed to persist override:", e));
}

/** Remove an override, updating the cache immediately and SQLite in the background. */
export function forgetOverride(modId: string): void
{
    cache.delete(modId);
    void db?.execute("DELETE FROM overrides WHERE mod_id = $1", [modId])
        .catch(e => console.error("Failed to delete override:", e));
}
