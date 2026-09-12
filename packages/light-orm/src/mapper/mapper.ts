/**
 * The driver already returns plain objects keyed by column name (that's
 * true of `pg` and every Postgres-wire driver we target), so there is no
 * column-name translation to do. This layer exists anyway, as its own
 * step in the pipeline, so that:
 *  - the client code never assumes anything about the driver's row shape
 *  - a future column-naming convention (e.g. camelCase mapping) has a
 *    single, obvious place to live without touching the client or compiler
 */
export function mapRows<T>(rows: unknown[]): T[] {
  return rows as T[];
}

export function mapFirstRow<T>(rows: unknown[]): T | null {
  return rows.length > 0 ? (rows[0] as T) : null;
}
