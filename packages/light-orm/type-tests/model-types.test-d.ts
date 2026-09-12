/**
 * These tests never run as JS - `vitest --typecheck` compiles this file
 * and fails if a `@ts-expect-error` line does NOT produce an error, or if
 * any other line DOES produce one. That is what proves the invalid
 * examples from the assignment are true compile-time errors, not just
 * runtime checks.
 */
import { describe, expectTypeOf, it } from "vitest";
import { boolean, number, string } from "../src/schema/column.js";
import { createDatabase } from "../src/client/client.js";
import { defineModel } from "../src/schema/model.js";
import type { DatabaseDriver } from "../src/driver/driver.js";

const Todo = defineModel("todo", {
  id: number().primaryKey().autoIncrement(),
  title: string().notNull(),
  completed: boolean().default(false),
});

const fakeDriver: DatabaseDriver = {
  query: async () => [],
};

const db = createDatabase({ driver: fakeDriver, models: { todo: Todo } });

describe("model type inference", () => {
  it("create() requires `title`, and treats `id`/`completed` as optional", () => {
    expectTypeOf(db.todo.create).parameter(0).toEqualTypeOf<{ title: string; id?: number; completed?: boolean }>();
  });

  it("findMany() resolves to the full row shape", () => {
    expectTypeOf(db.todo.findMany).returns.resolves.toEqualTypeOf<{ id: number; title: string; completed: boolean }[]>();
  });

  it("valid queries compile", async () => {
    await db.todo.findMany({ where: { completed: false } });
    await db.todo.findMany({ where: { title: { contains: "assign" } } });
    await db.todo.findFirst({ where: { id: 1 } });
    await db.todo.create({ title: "Finish assignment" });
    await db.todo.create({ title: "Finish assignment", completed: true });
    await db.todo.update({ where: { id: 1 }, data: { completed: true } });
    await db.todo.delete({ where: { id: 1 } });
  });

  it("rejects a filter on a field that doesn't exist", async () => {
    // @ts-expect-error `doesNotExist` is not a column of Todo
    await db.todo.findMany({ where: { doesNotExist: true } });
  });

  it("rejects a value of the wrong type on create", async () => {
    // @ts-expect-error `title` must be a string, not a number
    await db.todo.create({ title: 123 });
  });

  it("rejects create() when the required field is missing", async () => {
    // @ts-expect-error `title` is required
    await db.todo.create({});
  });

  it("rejects a where value of the wrong type on update", async () => {
    await db.todo.update({
      // @ts-expect-error `completed` must be a boolean, not a string
      where: { completed: "yes" },
      data: { title: "test" },
    });
  });

  it("rejects a data value of the wrong type on update", async () => {
    await db.todo.update({
      where: { id: 1 },
      // @ts-expect-error `title` must be a string, not a number
      data: { title: 123 },
    });
  });
});
