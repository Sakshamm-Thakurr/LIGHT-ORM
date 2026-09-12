import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler/sql.js";
import { buildConditions } from "../src/query/builders.js";
import type { InsertQuery, SelectQuery } from "../src/query/ast.js";

const MALICIOUS_TITLE = "'; DROP TABLE todo; --";

describe("SQL injection safety", () => {
  it("keeps a malicious equality value as a parameter, never inside the SQL string", () => {
    const where = buildConditions({ title: MALICIOUS_TITLE });
    const query: SelectQuery = { kind: "select", table: "todo", columns: ["id", "title"], where };
    const { sql, parameters } = compile(query);

    expect(sql).not.toContain("DROP TABLE");
    expect(sql).toBe('SELECT "id", "title" FROM "todo" WHERE "title" = $1');
    expect(parameters).toEqual([MALICIOUS_TITLE]);
  });

  it("keeps a malicious value as a parameter on INSERT", () => {
    const query: InsertQuery = {
      kind: "insert",
      table: "todo",
      columns: ["title"],
      values: { title: MALICIOUS_TITLE },
      returning: ["id", "title"],
    };
    const { sql, parameters } = compile(query);

    expect(sql).not.toContain("DROP TABLE");
    expect(sql).toBe('INSERT INTO "todo" ("title") VALUES ($1) RETURNING "id", "title"');
    expect(parameters).toEqual([MALICIOUS_TITLE]);
  });

  it("keeps a malicious value as a parameter inside a `contains` filter", () => {
    const where = buildConditions({ title: { contains: MALICIOUS_TITLE } });
    const query: SelectQuery = { kind: "select", table: "todo", columns: ["id", "title"], where };
    const { sql, parameters } = compile(query);

    expect(sql).not.toContain("DROP TABLE");
    expect(sql).toBe('SELECT "id", "title" FROM "todo" WHERE "title" LIKE $1');
    expect(parameters).toEqual([`%${MALICIOUS_TITLE}%`]);
  });

  it("rejects a table/column name that isn't a plain identifier, instead of quoting it unsafely", () => {
    const query: SelectQuery = {
      kind: "select",
      table: 'todo"; DROP TABLE todo; --',
      columns: ["id"],
      where: [],
    };
    expect(() => compile(query)).toThrow();
  });
});
