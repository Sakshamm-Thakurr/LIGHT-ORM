import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/client/client.js";
import { createPostgresDriver, type PostgresDriver } from "../src/driver/postgres.js";
import { boolean, number, string } from "../src/schema/column.js";
import { defineModel } from "../src/schema/model.js";

const connectionString = process.env.DATABASE_URL;

// Integration tests only run when a real Postgres connection is configured.
// This keeps `pnpm test` fast and offline by default, while still proving
// the whole pipeline works against a real database when one is available
// (see README > Testing for how to set DATABASE_URL locally).
const describeIntegration = connectionString ? describe : describe.skip;

describeIntegration("PostgreSQL integration", () => {
  const Todo = defineModel("integration_todo", {
    id: number().primaryKey().autoIncrement(),
    title: string().notNull(),
    completed: boolean().notNull().default(false),
  });

  let driver: PostgresDriver;
  let db: ReturnType<typeof createDatabase<{ todo: typeof Todo }>>;

  beforeAll(async () => {
    driver = createPostgresDriver({ connectionString: connectionString!, ssl: false });
    db = createDatabase({ driver, models: { todo: Todo } });
    await driver.query(
      `CREATE TABLE IF NOT EXISTS "integration_todo" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "completed" BOOLEAN NOT NULL DEFAULT false
      )`,
      [],
    );
  });

  beforeEach(async () => {
    await driver.query('TRUNCATE TABLE "integration_todo" RESTART IDENTITY', []);
  });

  afterAll(async () => {
    await driver.query('DROP TABLE IF EXISTS "integration_todo"', []);
    await driver.end();
  });

  it("creates a row and applies the schema default for `completed`", async () => {
    const todo = await db.todo.create({ title: "Finish assignment" });
    expect(todo.title).toBe("Finish assignment");
    expect(todo.completed).toBe(false);
    expect(typeof todo.id).toBe("number");
  });

  it("finds rows with an equality filter", async () => {
    await db.todo.create({ title: "A", completed: true });
    await db.todo.create({ title: "B", completed: false });
    const active = await db.todo.findMany({ where: { completed: false } });
    expect(active).toHaveLength(1);
    expect(active[0]?.title).toBe("B");
  });

  it("updates a row and returns the new state", async () => {
    const created = await db.todo.create({ title: "A" });
    const [updated] = await db.todo.update({ where: { id: created.id }, data: { completed: true } });
    expect(updated?.completed).toBe(true);
  });

  it("deletes a row", async () => {
    const created = await db.todo.create({ title: "A" });
    const deleted = await db.todo.delete({ where: { id: created.id } });
    expect(deleted).toHaveLength(1);
    const remaining = await db.todo.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("keeps a SQL-injection-shaped title as inert data end to end", async () => {
    const maliciousTitle = "'; DROP TABLE integration_todo; --";
    const todo = await db.todo.create({ title: maliciousTitle });
    expect(todo.title).toBe(maliciousTitle);

    // The table must still exist and be queryable - if injection had
    // worked, this call itself would throw.
    const found = await db.todo.findFirst({ where: { id: todo.id } });
    expect(found?.title).toBe(maliciousTitle);
  });
});
