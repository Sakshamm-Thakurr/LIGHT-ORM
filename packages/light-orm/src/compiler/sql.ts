import { QueryCompilationError } from "../errors.js";
import type { Condition, Query } from "../query/ast.js";

export interface CompiledSql {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Quotes a SQL identifier (table or column name) as a double-quoted
 * Postgres identifier. Values NEVER go through this function - only
 * schema-derived names do. Rejecting anything that isn't a plain
 * word (and doubling any embedded quotes) rules out identifier-based
 * injection even though these names come from trusted schema code.
 */
export function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new QueryCompilationError(`Invalid identifier: "${identifier}"`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

const OPERATOR_SQL: Record<Condition["operator"], string> = {
  eq: "=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  contains: "LIKE",
};

/**
 * Appends each condition's value as a new positional parameter and
 * returns the `a = $1 AND b > $2 ...` fragment. Every value from the
 * caller ends up here - never inlined into the SQL string.
 */
function compileWhere(conditions: readonly Condition[], parameters: unknown[]): string {
  return conditions
    .map((condition) => {
      parameters.push(condition.value);
      const column = quoteIdentifier(condition.column);
      const operator = OPERATOR_SQL[condition.operator];
      return `${column} ${operator} $${parameters.length}`;
    })
    .join(" AND ");
}

/**
 * Compiles a single query AST node into parameterized SQL. This function
 * is pure: same input always produces the same SQL string and the same
 * parameter order, which is what makes it independently unit-testable.
 */
export function compile(query: Query): CompiledSql {
  const parameters: unknown[] = [];
  const table = quoteIdentifier(query.table);

  switch (query.kind) {
    case "select": {
      const columns = query.columns.map(quoteIdentifier).join(", ");
      let sql = `SELECT ${columns} FROM ${table}`;
      if (query.where.length > 0) {
        sql += ` WHERE ${compileWhere(query.where, parameters)}`;
      }
      if (query.limit !== undefined) {
        parameters.push(query.limit);
        sql += ` LIMIT $${parameters.length}`;
      }
      return { sql, parameters };
    }

    case "insert": {
      if (query.columns.length === 0) {
        throw new QueryCompilationError(`INSERT into "${query.table}" has no columns to insert`);
      }
      const columns = query.columns.map(quoteIdentifier).join(", ");
      const placeholders = query.columns
        .map((column) => {
          parameters.push(query.values[column]);
          return `$${parameters.length}`;
        })
        .join(", ");
      let sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
      if (query.returning.length > 0) {
        sql += ` RETURNING ${query.returning.map(quoteIdentifier).join(", ")}`;
      }
      return { sql, parameters };
    }

    case "update": {
      if (query.setColumns.length === 0) {
        throw new QueryCompilationError(`UPDATE on "${query.table}" has no columns to set`);
      }
      const assignments = query.setColumns
        .map((column) => {
          parameters.push(query.set[column]);
          return `${quoteIdentifier(column)} = $${parameters.length}`;
        })
        .join(", ");
      let sql = `UPDATE ${table} SET ${assignments}`;
      if (query.where.length > 0) {
        sql += ` WHERE ${compileWhere(query.where, parameters)}`;
      }
      if (query.returning.length > 0) {
        sql += ` RETURNING ${query.returning.map(quoteIdentifier).join(", ")}`;
      }
      return { sql, parameters };
    }

    case "delete": {
      let sql = `DELETE FROM ${table}`;
      if (query.where.length > 0) {
        sql += ` WHERE ${compileWhere(query.where, parameters)}`;
      }
      if (query.returning.length > 0) {
        sql += ` RETURNING ${query.returning.map(quoteIdentifier).join(", ")}`;
      }
      return { sql, parameters };
    }
  }
}
