import { describe, expect, it } from "vitest";
import { boolean, number, string } from "../src/schema/column.js";
import { defineModel } from "../src/schema/model.js";

describe("schema metadata", () => {
  it("defaults a plain column to not-null, no default, not generated", () => {
    const col = string();
    expect(col.meta).toEqual({
      dataType: "string",
      nullable: false,
      hasDefault: false,
      defaultValue: undefined,
      isPrimaryKey: false,
      isAutoIncrement: false,
    });
  });

  it("marks a column nullable", () => {
    const col = string().nullable();
    expect(col.meta.nullable).toBe(true);
  });

  it("records a default value and marks the column as having one", () => {
    const col = boolean().default(false);
    expect(col.meta.hasDefault).toBe(true);
    expect(col.meta.defaultValue).toBe(false);
  });

  it("marks primaryKey and autoIncrement independently, both on the same builder", () => {
    const col = number().primaryKey().autoIncrement();
    expect(col.meta.isPrimaryKey).toBe(true);
    expect(col.meta.isAutoIncrement).toBe(true);
  });

  it("is immutable: calling a modifier returns a new builder, not a mutation", () => {
    const base = string();
    const notNullVersion = base.notNull();
    expect(base.meta.nullable).toBe(false);
    expect(notNullVersion).not.toBe(base);
  });

  it("defineModel stores the name and columns as given", () => {
    const Todo = defineModel("todo", {
      id: number().primaryKey().autoIncrement(),
      title: string().notNull(),
      completed: boolean().default(false),
    });

    expect(Todo.name).toBe("todo");
    expect(Object.keys(Todo.columns)).toEqual(["id", "title", "completed"]);
    expect(Todo.columns.completed.meta.hasDefault).toBe(true);
  });
});
