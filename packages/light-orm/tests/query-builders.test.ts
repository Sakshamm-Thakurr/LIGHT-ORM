import { describe, expect, it } from "vitest";
import { boolean, number, string } from "../src/schema/column.js";
import { QueryCompilationError, SchemaError } from "../src/errors.js";
import { buildConditions, buildInsertPlan, buildUpdatePlan } from "../src/query/builders.js";

describe("buildConditions", () => {
  it("returns an empty list for no filter", () => {
    expect(buildConditions(undefined)).toEqual([]);
  });

  it("treats a plain value as equality", () => {
    expect(buildConditions({ completed: false })).toEqual([{ column: "completed", operator: "eq", value: false }]);
  });

  it("sorts conditions by column name for deterministic output regardless of key order", () => {
    const a = buildConditions({ title: "x", completed: true });
    const b = buildConditions({ completed: true, title: "x" });
    expect(a).toEqual(b);
    expect(a.map((c) => c.column)).toEqual(["completed", "title"]);
  });

  it("expands an operator object into a Condition", () => {
    expect(buildConditions({ id: { gt: 5 } })).toEqual([{ column: "id", operator: "gt", value: 5 }]);
  });

  it("wraps `contains` values with % wildcards", () => {
    expect(buildConditions({ title: { contains: "assign" } })).toEqual([
      { column: "title", operator: "contains", value: "%assign%" },
    ]);
  });

  it("throws QueryCompilationError for an unsupported operator", () => {
    expect(() => buildConditions({ title: { startsWith: "a" } as any })).toThrow(QueryCompilationError);
  });
});

describe("buildInsertPlan", () => {
  const columns = {
    id: number().primaryKey().autoIncrement(),
    title: string().notNull(),
    completed: boolean().default(false),
  };

  it("includes explicit values and fills in defaults, skipping generated columns", () => {
    const plan = buildInsertPlan(columns, { title: "Finish assignment" });
    expect(plan.columns).toEqual(["completed", "title"]);
    expect(plan.values).toEqual({ completed: false, title: "Finish assignment" });
  });

  it("lets an explicit value override the default", () => {
    const plan = buildInsertPlan(columns, { title: "x", completed: true });
    expect(plan.values.completed).toBe(true);
  });

  it("throws SchemaError when a required field with no default is missing", () => {
    expect(() => buildInsertPlan(columns, {})).toThrow(SchemaError);
  });
});

describe("buildUpdatePlan", () => {
  it("builds a sorted column/value plan and skips undefined values", () => {
    const plan = buildUpdatePlan({ title: "New", completed: undefined });
    expect(plan.columns).toEqual(["title"]);
    expect(plan.values).toEqual({ title: "New" });
  });
});
