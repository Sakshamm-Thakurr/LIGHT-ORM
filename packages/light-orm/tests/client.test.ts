import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/client/client.js";
import { boolean, number, string } from "../src/schema/column.js";
import { defineModel } from "../src/schema/model.js";
import { FakeDriver } from "./support/fake-driver.js";

const Todo = defineModel("todo", {
  id: number().primaryKey().autoIncrement(),
  title: string().notNull(),
  completed: boolean().default(false),
});

function setup() {
  const driver = new FakeDriver();
  const db = createDatabase({ driver, models: { todo: Todo } });
  return { driver, db };
}

describe("ModelClient CRUD", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("create() fills in the default for `completed` and returns the created row", async () => {
    const { db } = ctx;
    const todo = await db.todo.create({ title: "Finish assignment" });
    expect(todo.title).toBe("Finish assignment");
    expect(todo.completed).toBe(false);
    expect(typeof todo.id).toBe("number");
  });

  it("findMany() with no filter returns everything", async () => {
    const { db } = ctx;
    await db.todo.create({ title: "A" });
    await db.todo.create({ title: "B" });
    const todos = await db.todo.findMany();
    expect(todos).toHaveLength(2);
  });

  it("findMany() filters by equality", async () => {
    const { db } = ctx;
    await db.todo.create({ title: "A", completed: true });
    await db.todo.create({ title: "B", completed: false });
    const todos = await db.todo.findMany({ where: { completed: false } });
    expect(todos).toHaveLength(1);
    expect(todos[0]?.title).toBe("B");
  });

  it("findMany() applies multiple AND conditions", async () => {
    const { db } = ctx;
    await db.todo.create({ title: "Buy milk", completed: false });
    await db.todo.create({ title: "Buy eggs", completed: true });
    const todos = await db.todo.findMany({ where: { completed: false, title: { contains: "Buy" } } });
    expect(todos).toHaveLength(1);
    expect(todos[0]?.title).toBe("Buy milk");
  });

  it("findFirst() returns null when nothing matches", async () => {
    const { db } = ctx;
    const result = await db.todo.findFirst({ where: { title: "nope" } });
    expect(result).toBeNull();
  });

  it("update() changes matching rows and returns them", async () => {
    const { db } = ctx;
    const created = await db.todo.create({ title: "A" });
    const updated = await db.todo.update({ where: { id: created.id }, data: { completed: true } });
    expect(updated).toHaveLength(1);
    expect(updated[0]?.completed).toBe(true);
  });

  it("delete() removes matching rows and returns them", async () => {
    const { db } = ctx;
    const created = await db.todo.create({ title: "A" });
    const deleted = await db.todo.delete({ where: { id: created.id } });
    expect(deleted).toHaveLength(1);
    const remaining = await db.todo.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("invokes the onQuery hook with SQL and timing but never raw parameter values", async () => {
    const driver = new FakeDriver();
    const events: any[] = [];
    const db = createDatabase({ driver, models: { todo: Todo }, onQuery: (e) => events.push(e) });
    await db.todo.create({ title: "A" });
    expect(events).toHaveLength(1);
    expect(events[0].operation).toBe("create");
    expect(events[0].model).toBe("todo");
    expect(typeof events[0].sql).toBe("string");
    expect(typeof events[0].parameterCount).toBe("number");
    expect(events[0]).not.toHaveProperty("parameters");
  });
});
