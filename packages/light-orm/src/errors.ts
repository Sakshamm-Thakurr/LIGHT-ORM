/**
 * A small, flat error hierarchy. Each subclass marks which layer failed,
 * which is enough to be useful without over-engineering an error taxonomy.
 * None of these ever include connection strings or credentials - only
 * the SQL-adjacent details needed to debug the query itself.
 */
export class OrmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A model/column definition problem, or a value that violates it (e.g. a missing required field). */
export class SchemaError extends OrmError {}

/** The query representation could not be turned into valid SQL (e.g. an unsupported operator or a bad identifier). */
export class QueryCompilationError extends OrmError {}

/** The database rejected or failed to execute an otherwise well-formed query. */
export class DatabaseError extends OrmError {
  constructor(
    message: string,
    /** The underlying driver error message, never the connection string. */
    public readonly detail?: string,
  ) {
    super(message);
  }
}
