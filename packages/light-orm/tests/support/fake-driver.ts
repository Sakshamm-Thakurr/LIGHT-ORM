import type { DatabaseDriver } from "../../src/driver/driver.js";

export interface RecordedCall {
  sql: string;
  parameters: readonly unknown[];
}

interface ParsedCondition {
  column: string;
  op: string;
  paramIndex: number; // 1-based, matches $n
}

function parseConditions(whereClause: string): ParsedCondition[] {
  const conditions: ParsedCondition[] = [];
  const re = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*(=|>|>=|<|<=|LIKE)\s*\$(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(whereClause))) {
    conditions.push({ column: match[1]!, op: match[2]!, paramIndex: Number(match[3]) });
  }
  return conditions;
}

function matchesConditions(
  row: Record<string, unknown>,
  conditions: ParsedCondition[],
  parameters: readonly unknown[],
): boolean {
  return conditions.every(({ column, op, paramIndex }) => {
    const expected = parameters[paramIndex - 1];
    const actual = row[column];
    switch (op) {
      case "=":
        return actual === expected;
      case ">":
        return (actual as number) > (expected as number);
      case ">=":
        return (actual as number) >= (expected as number);
      case "<":
        return (actual as number) < (expected as number);
      case "<=":
        return (actual as number) <= (expected as number);
      case "LIKE": {
        const pattern = String(expected).replace(/^%/, "").replace(/%$/, "");
        return String(actual).includes(pattern);
      }
      default:
        return false;
    }
  });
}

/**
 * A minimal in-memory DatabaseDriver used to test the ORM client without a
 * real Postgres connection. It evaluates the WHERE clause the compiler
 * produced (by matching `"col" op $n` patterns) against parameter values,
 * so create/findMany/findFirst/update/delete behave close enough to a real
 * database to exercise the client end to end. It is test-only support code,
 * never exported from the package.
 */
export class FakeDriver implements DatabaseDriver {
  calls: RecordedCall[] = [];
  private tables = new Map<string, Record<string, unknown>[]>();
  private nextId = new Map<string, number>();

  seed(table: string, rows: Record<string, unknown>[]): void {
    this.tables.set(table, [...rows]);
  }

  rows(table: string): Record<string, unknown>[] {
    return this.tables.get(table) ?? [];
  }

  async query<T>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
    this.calls.push({ sql, parameters });

    const table = sql.match(/(?:FROM|INTO|UPDATE)\s+"([a-zA-Z_][a-zA-Z0-9_]*)"/)?.[1] ?? "unknown";
    const rows = this.tables.get(table) ?? [];
    this.tables.set(table, rows);

    if (sql.startsWith("INSERT")) {
      const columns =
        [...sql.matchAll(/\(([^)]+)\)/g)][0]?.[1].split(",").map((c) => c.trim().replace(/"/g, "")) ?? [];
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = parameters[i];
      });
      if (!("id" in row)) {
        const id = (this.nextId.get(table) ?? 0) + 1;
        this.nextId.set(table, id);
        row.id = id;
      }
      rows.push(row);
      return [row] as T[];
    }

    const whereMatch = sql.match(/WHERE (.+?)(?: RETURNING| LIMIT|$)/);
    const conditions = whereMatch ? parseConditions(whereMatch[1]!) : [];
    const matching = rows.filter((row) => matchesConditions(row, conditions, parameters));

    if (sql.startsWith("SELECT")) {
      const limitMatch = sql.match(/LIMIT \$(\d+)/);
      if (limitMatch) {
        const limit = Number(parameters[Number(limitMatch[1]) - 1]);
        return matching.slice(0, limit) as T[];
      }
      return matching as T[];
    }

    if (sql.startsWith("UPDATE")) {
      const setMatch = sql.match(/SET (.+?) WHERE/) ?? sql.match(/SET (.+?)$/);
      const setClause = setMatch?.[1] ?? "";
      const assignments = [...setClause.matchAll(/"([a-zA-Z_][a-zA-Z0-9_]*)"\s*=\s*\$(\d+)/g)];
      for (const row of matching) {
        for (const [, column, idx] of assignments) {
          row[column!] = parameters[Number(idx) - 1];
        }
      }
      return matching as T[];
    }

    if (sql.startsWith("DELETE")) {
      const remaining = rows.filter((row) => !matching.includes(row));
      this.tables.set(table, remaining);
      return matching as T[];
    }

    return [] as T[];
  }
}
