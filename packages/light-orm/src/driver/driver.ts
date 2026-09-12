/**
 * The ORM core (client + compiler) only ever talks to this interface.
 * That boundary is what lets the same query logic run against any
 * Postgres-wire-compatible backend (node-postgres, Neon's serverless
 * driver, a test double, ...) without the core code knowing or caring.
 */
export interface DatabaseDriver {
  query<T>(sql: string, parameters: readonly unknown[]): Promise<T[]>;
}
