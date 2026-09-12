# @sakshamthakur/light-orm

A minimal, strongly typed TypeScript ORM for serverless PostgreSQL.

```ts
import { defineModel, number, string, boolean, createDatabase, createPostgresDriver } from "@sakshamthakur/light-orm";

const Todo = defineModel("todo", {
  id: number().primaryKey().autoIncrement(),
  title: string().notNull(),
  completed: boolean().notNull().default(false),
});

const driver = createPostgresDriver({ connectionString: process.env.DATABASE_URL! });
const db = createDatabase({ driver, models: { todo: Todo } });

const todo = await db.todo.create({ title: "Finish assignment" });
await db.todo.findMany({ where: { completed: false } });
```

Full documentation, architecture, and the example Todo app live in the
[monorepo README](https://github.com/<your-username>/light-orm#readme) and
[ARCHITECTURE.md](https://github.com/<your-username>/light-orm/blob/main/ARCHITECTURE.md).

## Features

- Schema DSL with type-level defaults/nullability/generation tracking
- Full CRUD + filtering (`equals`, `gt`/`gte`/`lt`/`lte`, `contains`)
- Compile-time rejection of invalid fields/types (`@ts-expect-error`-tested)
- Deterministic, parameterized SQL compiler (no string-built queries)
- Small `DatabaseDriver` interface + a `pg`-based Postgres adapter
- Designed for serverless Postgres (Neon, Supabase, etc.)

## Known limitations

No relations/joins, no migrations, no transactions, no CLI. See the
monorepo README's "Known limitations" section for the full list and
reasoning.
