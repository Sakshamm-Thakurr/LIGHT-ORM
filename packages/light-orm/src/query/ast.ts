/**
 * The query representation is the intermediate layer between the typed
 * ORM API and the SQL compiler. It is intentionally small: a handful of
 * plain data shapes with no behaviour. Keeping it inert (no methods, no
 * hidden state) is what makes the compiler deterministic and unit-testable
 * in isolation from the ORM API and the database.
 */

export type ComparisonOperator = "eq" | "gt" | "gte" | "lt" | "lte" | "contains";

export interface Condition {
  readonly column: string;
  readonly operator: ComparisonOperator;
  readonly value: unknown;
}

export interface SelectQuery {
  readonly kind: "select";
  readonly table: string;
  /** Columns to select, already sorted for deterministic SQL output. */
  readonly columns: readonly string[];
  /** Conditions ANDed together, already sorted by column name. */
  readonly where: readonly Condition[];
  readonly limit?: number;
}

export interface InsertQuery {
  readonly kind: "insert";
  readonly table: string;
  /** Columns being inserted, already sorted for deterministic SQL output. */
  readonly columns: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly returning: readonly string[];
}

export interface UpdateQuery {
  readonly kind: "update";
  readonly table: string;
  /** Columns being set, already sorted for deterministic SQL output. */
  readonly setColumns: readonly string[];
  readonly set: Readonly<Record<string, unknown>>;
  readonly where: readonly Condition[];
  readonly returning: readonly string[];
}

export interface DeleteQuery {
  readonly kind: "delete";
  readonly table: string;
  readonly where: readonly Condition[];
  readonly returning: readonly string[];
}

export type Query = SelectQuery | InsertQuery | UpdateQuery | DeleteQuery;
