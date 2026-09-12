import { QueryCompilationError, SchemaError } from "../errors.js";
import type { AnyColumnBuilder } from "../schema/column.js";
import type { Condition, ComparisonOperator } from "./ast.js";

const OPERATOR_MAP: Record<string, ComparisonOperator> = {
  equals: "eq",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  contains: "contains",
};

function sortedEntries<T>(obj: Record<string, T>): [string, T][] {
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Converts a `where` filter object (as accepted by the public API) into a
 * flat, alphabetically-sorted list of AND-ed conditions. Sorting is what
 * makes the compiler's output deterministic regardless of the order keys
 * were written in the object literal.
 */
export function buildConditions(where: Record<string, unknown> | undefined): Condition[] {
  if (!where) return [];

  const conditions: Condition[] = [];

  for (const [column, raw] of sortedEntries(where)) {
    if (raw === null || typeof raw !== "object") {
      conditions.push({ column, operator: "eq", value: raw });
      continue;
    }

    for (const [op, value] of sortedEntries(raw as Record<string, unknown>)) {
      const operator = OPERATOR_MAP[op];
      if (!operator) {
        throw new QueryCompilationError(`Unsupported filter operator "${op}" on column "${column}"`);
      }
      conditions.push({
        column,
        operator,
        value: operator === "contains" ? `%${value}%` : value,
      });
    }
  }

  return conditions;
}

/**
 * Decides which columns to include in an INSERT and what value each one
 * gets, using schema metadata: explicit values win, then column defaults,
 * then DB-generated columns are skipped, then missing required columns
 * raise a clear error before any SQL is built.
 */
export function buildInsertPlan(
  columns: Record<string, AnyColumnBuilder>,
  data: Record<string, unknown>,
): { columns: string[]; values: Record<string, unknown> } {
  const insertColumns: string[] = [];
  const values: Record<string, unknown> = {};

  for (const [name, column] of sortedEntries(columns)) {
    const meta = column.meta;
    const provided = Object.prototype.hasOwnProperty.call(data, name) && data[name] !== undefined;

    if (provided) {
      insertColumns.push(name);
      values[name] = data[name];
    } else if (meta.hasDefault) {
      insertColumns.push(name);
      values[name] = meta.defaultValue;
    } else if (meta.isPrimaryKey || meta.isAutoIncrement) {
      // Left for the database to generate.
      continue;
    } else if (!meta.nullable) {
      throw new SchemaError(`Missing required field "${name}" for create()`);
    }
  }

  return { columns: insertColumns, values };
}

/** Builds the deterministic, alphabetically-sorted SET clause for UPDATE. */
export function buildUpdatePlan(data: Record<string, unknown>): { columns: string[]; values: Record<string, unknown> } {
  const columns: string[] = [];
  const values: Record<string, unknown> = {};
  for (const [name, value] of sortedEntries(data)) {
    if (value === undefined) continue;
    columns.push(name);
    values[name] = value;
  }
  return { columns, values };
}
