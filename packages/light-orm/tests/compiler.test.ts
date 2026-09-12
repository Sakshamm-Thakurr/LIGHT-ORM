import { describe, expect, it } from "vitest";
import { compile, quoteIdentifier } from "../src/compiler/sql.js";
import { QueryCompilationError } from "../src/errors.js";
import type { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from "../src/query/ast.js";

describe("quoteIdentifier", () => {
  it("wraps a plain identifier in double quotes", () => {
    expect(quoteIdentifier("todo")).toBe('"todo"');
  });

  it("rejects identifiers that aren't a plain word", () => {
    expect(() => quoteIdentifier('todo"; DROP TABLE users; --')).toThrow(QueryCompilationError);
    expect(() => quoteIdentifier("todo table")).toThrow(QueryCompilationError);
    expect(() => quoteIdentifier("1todo")).toThrow(QueryCompilationError);
  });
});

describe("compile: SELECT", () => {
  const base: SelectQuery = {
    kind: "select",
    table: "todo",
    columns: ["completed", "id", "title"],
    where: [],
  };

  it("compiles a query with no filters", () => {
    const { sql, parameters } = compile(base);
    expect(sql).toBe('SELECT "completed", "id", "title" FROM "todo"');
    expect(parameters).toEqual([]);
  });

  it("compiles a single equality filter as a parameter, never inlined", () => {
    const query: SelectQuery = { ...base, where: [{ column: "completed", operator: "eq", value: false }] };
    const { sql, parameters } = compile(query);
    expect(sql).toBe('SELECT "completed", "id", "title" FROM "todo" WHERE "completed" = $1');
    expect(parameters).toEqual([false]);
  });

  it("compiles multiple AND-ed conditions with sequential parameter numbering", () => {
    const query: SelectQuery = {
      ...base,
      where: [
        { column: "completed", operator: "eq", value: false },
        { column: "id", operator: "gt", value: 5 },
      ],
    };
    const { sql, parameters } = compile(query);
    expect(sql).toBe('SELECT "completed", "id", "title" FROM "todo" WHERE "completed" = $1 AND "id" > $2');
    expect(parameters).toEqual([false, 5]);
  });

  it("compiles LIMIT as its own parameter", () => {
    const query: SelectQuery = { ...base, limit: 10 };
    const { sql, parameters } = compile(query);
    expect(sql).toBe('SELECT "completed", "id", "title" FROM "todo" LIMIT $1');
    expect(parameters).toEqual([10]);
  });

  it("is deterministic across repeated compilations of the same query", () => {
    const query: SelectQuery = { ...base, where: [{ column: "id", operator: "eq", value: 1 }] };
    const first = compile(query);
    const second = compile(query);
    expect(first).toEqual(second);
  });

  it("compiles the contains operator to LIKE", () => {
    const query: SelectQuery = { ...base, where: [{ column: "title", operator: "contains", value: "%assign%" }] };
    const { sql, parameters } = compile(query);
    expect(sql).toContain('"title" LIKE $1');
    expect(parameters).toEqual(["%assign%"]);
  });
});

describe("compile: INSERT", () => {
  it("compiles columns, placeholders and RETURNING in step", () => {
    const query: InsertQuery = {
      kind: "insert",
      table: "todo",
      columns: ["completed", "title"],
      values: { completed: false, title: "Finish assignment" },
      returning: ["completed", "id", "title"],
    };
    const { sql, parameters } = compile(query);
    expect(sql).toBe(
      'INSERT INTO "todo" ("completed", "title") VALUES ($1, $2) RETURNING "completed", "id", "title"',
    );
    expect(parameters).toEqual([false, "Finish assignment"]);
  });

  it("throws QueryCompilationError when there are no columns to insert", () => {
    const query: InsertQuery = { kind: "insert", table: "todo", columns: [], values: {}, returning: [] };
    expect(() => compile(query)).toThrow(QueryCompilationError);
  });
});

describe("compile: UPDATE", () => {
  it("compiles SET and WHERE with continuing parameter numbers", () => {
    const query: UpdateQuery = {
      kind: "update",
      table: "todo",
      setColumns: ["completed"],
      set: { completed: true },
      where: [{ column: "id", operator: "eq", value: 1 }],
      returning: ["completed", "id", "title"],
    };
    const { sql, parameters } = compile(query);
    expect(sql).toBe(
      'UPDATE "todo" SET "completed" = $1 WHERE "id" = $2 RETURNING "completed", "id", "title"',
    );
    expect(parameters).toEqual([true, 1]);
  });
});

describe("compile: DELETE", () => {
  it("compiles a WHERE-scoped delete with RETURNING", () => {
    const query: DeleteQuery = {
      kind: "delete",
      table: "todo",
      where: [{ column: "id", operator: "eq", value: 1 }],
      returning: ["id"],
    };
    const { sql, parameters } = compile(query);
    expect(sql).toBe('DELETE FROM "todo" WHERE "id" = $1 RETURNING "id"');
    expect(parameters).toEqual([1]);
  });
});
