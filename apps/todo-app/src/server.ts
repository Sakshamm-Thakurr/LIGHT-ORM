// Must be the first import: loads apps/todo-app/.env into process.env
// before db.ts reads process.env.DATABASE_URL at module load time.
import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { DatabaseError, OrmError, SchemaError } from "@sakshamthakur/light-orm";
import { CREATE_TODO_TABLE_SQL, db, driver } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get(
  "/api/todos",
  asyncHandler(async (req, res) => {
    const { completed } = req.query;
    const where = completed === undefined ? undefined : { completed: completed === "true" };
    const todos = await db.todo.findMany({ where });
    res.json(todos);
  }),
);

app.post(
  "/api/todos",
  asyncHandler(async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const todo = await db.todo.create({ title });
    res.status(201).json(todo);
  }),
);

app.patch(
  "/api/todos/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "id must be an integer" });
      return;
    }
    const data: { title?: string; completed?: boolean } = {};
    if (typeof req.body?.title === "string") data.title = req.body.title;
    if (typeof req.body?.completed === "boolean") data.completed = req.body.completed;

    const updated = await db.todo.update({ where: { id }, data });
    if (updated.length === 0) {
      res.status(404).json({ error: "todo not found" });
      return;
    }
    res.json(updated[0]);
  }),
);

app.delete(
  "/api/todos/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "id must be an integer" });
      return;
    }
    const deleted = await db.todo.delete({ where: { id } });
    if (deleted.length === 0) {
      res.status(404).json({ error: "todo not found" });
      return;
    }
    res.status(204).end();
  }),
);

// Centralized error handling: ORM errors are mapped to sensible HTTP
// statuses; nothing here ever echoes DATABASE_URL or driver internals.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SchemaError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof DatabaseError) {
    // eslint-disable-next-line no-console
    console.error("[db error]", err.message, err.detail);
    res.status(502).json({ error: "database error" });
    return;
  }
  if (err instanceof OrmError) {
    res.status(500).json({ error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("[unexpected error]", err);
  res.status(500).json({ error: "internal server error" });
});

async function main() {
  // The ORM intentionally has no migration system (documented as a known
  // limitation), so the demo bootstraps its one table with a plain SQL
  // statement issued straight through the driver.
  await driver.query(CREATE_TODO_TABLE_SQL, []);
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`todo-api listening on http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error);
  process.exit(1);
});
