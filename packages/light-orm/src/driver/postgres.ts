import pg from "pg";
import { DatabaseError } from "../errors.js";
import type { DatabaseDriver } from "./driver.js";

const { Pool } = pg;

export interface PostgresDriverOptions {
  connectionString: string;
  /**
   * Kept intentionally small (default 3). Serverless functions run many
   * short-lived instances concurrently, so a large per-instance pool just
   * multiplies against Postgres's connection limit. For real production
   * traffic on serverless, put PgBouncer / Neon's pooler in front instead
   * of raising this number.
   */
  maxConnections?: number;
  ssl?: boolean;
}

export interface PostgresDriver extends DatabaseDriver {
  /** Closes the underlying pool. Call this when a long-lived process shuts down. */
  end(): Promise<void>;
}

/**
 * Creates a DatabaseDriver backed by `pg`. The pool is created once, at
 * call time, and reused across queries within the same process - there
 * is no other global mutable state. In a serverless function this should
 * be created once per module scope (outside the handler) so warm
 * invocations reuse the same pool instead of opening a new one each time.
 */
export function createPostgresDriver(options: PostgresDriverOptions): PostgresDriver {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 3,
    idleTimeoutMillis: 10_000,
    ssl: options.ssl ?? true,
  });

  return {
    async query<T>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
      try {
        const result = await pool.query(sql, parameters as unknown[]);
        return result.rows as T[];
      } catch (error) {
        // Only the driver-level error message is surfaced - never the
        // connection string or any other configuration passed to Pool.
        const detail = error instanceof Error ? error.message : String(error);
        throw new DatabaseError("Database query failed", detail);
      }
    },
    async end() {
      await pool.end();
    },
  };
}
