# light-orm

A minimal, strongly typed PostgreSQL ORM with a clean developer API, a
typed query representation, deterministic SQL compilation, safe
parameterization, and a genuinely reusable npm package — built as a
software engineering assignment, together with a small Todo app that
demonstrates it end to end.

> **Status at a glance:** core ORM package complete, 100% unit-tested,
> integration-tested against a real local Postgres instance, and wired
> into a working Todo API + React frontend. **Not yet done:** npm
> publish and public deployment — both need my account credentials; see
> [Known limitations](#known-limitations) and
> [npm package](#npm-package) for the exact commands left to run.

---

## 1. Project overview

`light-orm` targets one narrow, well-defined problem: give a TypeScript
project strongly typed CRUD and filtering against Postgres, without
pulling in a full-featured ORM's surface area (relations, migrations,
raw-query builders, multiple dialects, ...). The package is
`packages/light-orm`; `apps/todo-app` is a small Todo app (Express API +
React frontend) that consumes it exactly the way an external project
would — through the published package's public exports, never through
internal source paths.

## 2. Why this ORM exists

Most lightweight ORM exercises end up as a SQL string builder with a thin
type veneer on top. The goal here was the opposite: make TypeScript do
real work (inferring what fields are required, rejecting bad filters at
compile time) while keeping the runtime implementation small enough to
fully explain in an interview. See [ARCHITECTURE.md](./ARCHITECTURE.md)
for the layer-by-layer design and the reasoning behind each one.

## 3. Architecture (short version)

```
Model Definition → Schema Metadata → Typed API → Query Representation
   → SQL Compiler → Driver → PostgreSQL → Result Mapper
```

Full explanation, responsibilities, dependencies, and extension points
for every layer: [ARCHITECTURE.md](./ARCHITECTURE.md).

## 4. Features

- Schema DSL: `number()`, `string()`, `boolean()` with `.primaryKey()`,
  `.autoIncrement()`, `.notNull()`, `.nullable()`, `.default(value)`.
- CRUD: `create`, `findMany`, `findFirst`, `update`, `delete`.
- Filtering: equality, `gt`/`gte`/`lt`/`lte`, `contains`, multiple AND
  conditions.
- Full compile-time type safety (see [§10](#10-type-safety)).
- Deterministic SQL compiler, independently unit-tested.
- Parameterized SQL everywhere — no string-built queries.
- Small driver interface + a `pg`-based Postgres adapter, designed for
  serverless Postgres providers (Neon, Supabase, etc.).
- Optional `onQuery` hook for query inspection/debugging (operation,
  model, SQL, parameter *count*, duration — never raw parameter values).
- Small, flat error hierarchy: `OrmError`, `SchemaError`,
  `QueryCompilationError`, `DatabaseError`.

**Not implemented** (see [Known limitations](#known-limitations)):
relations/joins, migrations, transactions, a validation layer, a CLI.

## 5. Installation

```bash
git clone <this-repo>
cd light-orm
pnpm install
```

Requires Node 18+ and pnpm. The workspace has two packages:
`packages/light-orm` (the ORM) and `apps/todo-app` (API +
`apps/todo-app/frontend`).

## 6. Quick start

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
const active = await db.todo.findMany({ where: { completed: false } });
await db.todo.update({ where: { id: todo.id }, data: { completed: true } });
await db.todo.delete({ where: { id: todo.id } });
```

The table itself isn't created by the ORM (no migrations — see
limitations); the Todo app bootstraps its one table with a plain
`CREATE TABLE IF NOT EXISTS` at startup (`apps/todo-app/src/db.ts`).

## 7. Schema definition

```ts
const Todo = defineModel("todo", {
  id: number().primaryKey().autoIncrement(), // generated, optional on create
  title: string().notNull(),                  // required on create
  completed: boolean().default(false),        // optional on create, defaults to false
});
```

- `.primaryKey()` / `.autoIncrement()` mark a column as DB-generated —
  it's skipped on `create()` unless you explicitly provide a value.
- `.default(value)` makes a column optional on `create()`; the default is
  sent as the literal value on insert (not a DB-side `DEFAULT` clause).
- `.nullable()` widens the inferred type to `T | null`.

## 8. CRUD examples

```ts
await db.todo.create({ title: "Write documentation" });
await db.todo.findMany();
await db.todo.findFirst({ where: { id: 1 } });
await db.todo.update({ where: { id: 1 }, data: { completed: true } });
await db.todo.delete({ where: { id: 1 } });
```

## 9. Filtering

```ts
await db.todo.findMany({ where: { completed: false } });
await db.todo.findMany({ where: { completed: false, title: { contains: "assign" } } });
await db.todo.findMany({ where: { id: { gt: 10 } }, limit: 20 });
```

Supported operators: `equals` (implicit for a plain value), `gt`, `gte`,
`lt`, `lte`, `contains` (compiles to `LIKE`). Multiple keys in one
`where` object are AND-ed together.

## 10. Type safety

Given the `Todo` model above:

```ts
// Compiles: `title` is the only required field.
await db.todo.create({ title: "Finish assignment" });

// @ts-expect-error - `doesNotExist` is not a column of Todo
await db.todo.findMany({ where: { doesNotExist: true } });

// @ts-expect-error - `title` must be a string
await db.todo.create({ title: 123 });

// @ts-expect-error - `completed` must be a boolean
await db.todo.update({ where: { completed: "yes" }, data: { title: "test" } });
```

All four of these are asserted in
[`packages/light-orm/type-tests/model-types.test-d.ts`](./packages/light-orm/type-tests/model-types.test-d.ts)
and checked by `vitest --typecheck` (see [Testing](#15-testing)) — they
are compiler errors, not runtime checks.

**How inference works, briefly:** each column builder carries its JS type
and three booleans (`nullable`, `hasDefault`, `generated`) as *type
parameters*, not just runtime metadata. A handful of small conditional
types in `schema/model.ts` read those parameters to build `ModelRow`
(full shape), `ModelCreateInput` (required vs. optional split),
`ModelUpdateInput` (all optional), and `ModelWhereInput` (per-column
filter shape). Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md#2-schema-metadata--type-inference--schemamodelts).

## 11. Query compilation

```
db.todo.findMany({ where: { completed: false } })
```

becomes, deterministically:

```sql
SELECT "completed", "id", "title" FROM "todo" WHERE "completed" = $1
-- parameters: [false]
```

`where` conditions and insert/update columns are sorted alphabetically
before compilation, so the same logical query always compiles to the same
SQL string with the same parameter order — see
`packages/light-orm/tests/compiler.test.ts`.

## 12. Security

- Every value reaches SQL as a `$n` placeholder; the SQL string and the
  parameter array are sent separately to Postgres by `pg`, so a value can
  never be reinterpreted as SQL syntax.
- Table/column identifiers are validated against
  `^[a-zA-Z_][a-zA-Z0-9_]*$` and rejected otherwise, before being wrapped
  in double quotes.
- `packages/light-orm/tests/security.test.ts` and the `contains` malicious-title
  Postgres integration test both assert that a title like
  `'; DROP TABLE todo; --` stays inert data all the way through the
  stack, table intact.

## 13. Serverless Postgres setup

Point `DATABASE_URL` at any Postgres-compatible connection string (Neon,
Supabase, RDS, or a local instance). The Postgres driver
(`createPostgresDriver`) defaults to a small connection pool (`max: 3`)
and `ssl: true`, matching what serverless providers expect; pass
`ssl: false` for a local/dev database with no TLS cert (the Todo app's
`apps/todo-app/src/db.ts` does this automatically when the connection
string points at `localhost`/`127.0.0.1`).

**Tradeoff, stated plainly:** the pool is created once per process/module
scope, not per request. That's correct for a long-lived server (like
`apps/todo-app`'s Express process) and fine for a serverless function's
*warm* invocations, but a high-concurrency serverless deployment should
put a connection pooler (PgBouncer, or Neon's built-in pooler) in front
rather than raising `maxConnections`.

## 14. Monorepo structure

```
light-orm/
├── apps/
│   └── todo-app/
│       ├── src/            # Express API (server.ts, db.ts, models.ts)
│       └── frontend/       # React + Vite UI
├── packages/
│   └── light-orm/
│       ├── src/
│       │   ├── schema/     # column builders + type inference
│       │   ├── query/      # AST + where/insert/update plan builders
│       │   ├── compiler/   # AST -> parameterized SQL
│       │   ├── driver/     # DatabaseDriver interface + Postgres adapter
│       │   ├── mapper/     # rows -> typed objects
│       │   ├── client/     # createDatabase / ModelClient
│       │   └── index.ts    # public exports
│       ├── tests/          # unit + integration tests
│       └── type-tests/     # compile-time (@ts-expect-error) tests
├── pnpm-workspace.yaml
├── ARCHITECTURE.md
└── README.md (this file)
```

`apps/todo-app` and its `frontend` only import
`from "@sakshamthakur/light-orm"` (the package name), never
`from "../../../packages/light-orm/src/..."` — enforced by convention
today; see [Known limitations](#known-limitations) for what a stricter
enforcement (e.g. an ESLint boundary rule) would look like.

## 15. Testing

```bash
cd packages/light-orm
pnpm test              # unit tests (fast, no database needed)
pnpm exec vitest --run --typecheck   # + compile-time type tests
DATABASE_URL=postgres://user:pass@localhost:5432/db pnpm exec vitest run  # + Postgres integration tests
```

**Actually run, as of this submission:**

| Suite | Command | Result |
|---|---|---|
| Unit tests (schema, compiler, security, query builders, client via fake driver, mapper) | `vitest run` | **43 passed** |
| + compile-time type tests (`@ts-expect-error` cases) | `vitest --run --typecheck` | **51 passed** (43 + 8 type tests) |
| + real Postgres integration tests (local Postgres 16, `DATABASE_URL` set) | `vitest run` | **48 passed** (43 + 5 integration) |
| ORM package `tsc --noEmit` | — | 0 errors |
| Todo backend `tsc --noEmit` | — | 0 errors |
| Todo frontend `tsc --noEmit` | — | 0 errors |
| Todo API manual smoke test (create/list/filter/update/delete, incl. an injection-shaped title) | `curl` against a running server + local Postgres | All endpoints returned expected results |

Integration tests are skipped automatically (`describe.skip`) when
`DATABASE_URL` isn't set, so `pnpm test` stays fast and offline by
default.

## 16. Benchmark methodology / results

Not implemented. Given the scope of this assignment, network/database
latency dominates any ORM-side CPU cost (query-AST construction and SQL
string assembly are both sub-millisecond, plain object/array operations
with no I/O) — a benchmark suite would mostly measure Postgres round-trip
time, not the ORM. No numbers are claimed here that weren't actually
measured, so none are included.

## 17. npm package

Package name: `@sakshamthakur/light-orm` (scoped to avoid clashing with
existing `light-orm` packages on the registry).

**Verified locally:**
- `pnpm --filter @sakshamthakur/light-orm build` — compiles cleanly,
  emits `.js` + `.d.ts` + source maps into `packages/light-orm/dist/`.
- `npm pack --dry-run` from `packages/light-orm/` — produces a
  69-file, ~17 kB tarball containing only `dist/` and `package.json`
  (no `src/`, no test files, no `.env*`).
- The Todo backend consumes the package via `workspace:*` (pnpm's
  workspace protocol) and typechecks/builds against its public exports
  only.

**Not yet done — the one manual step:** the package has not been
published to npm. Publishing requires an authenticated npm account,
which I can't do on your behalf. To publish:

```bash
cd packages/light-orm
npm login                 # your npm credentials
npm publish --access public
```

After that, `apps/todo-app` could swap its `workspace:*` dependency for
a real published version range (e.g. `^0.1.0`) to prove it installs like
an ordinary external dependency — left as-is for now since the package
isn't published yet.

## 18. Live Todo demo

**Live URL:** _not yet deployed — add it here once [DEPLOYMENT.md](./DEPLOYMENT.md) is done._

Deployment configs (`render.yaml`, `apps/todo-app/frontend/vercel.json`)
are already in the repo and deployment needs only a hosting account,
which only I can authenticate. [DEPLOYMENT.md](./DEPLOYMENT.md) has the
exact, minimal manual steps (create a Neon DB, deploy `render.yaml` on
Render, deploy the frontend on Vercel, push to GitHub). To run it locally
instead:

```bash
# 1. Start Postgres and set DATABASE_URL (see .env.example)
cp .env.example apps/todo-app/.env   # then edit DATABASE_URL

# 2. Build the ORM package once
pnpm --filter @sakshamthakur/light-orm build

# 3. Run the API
pnpm --filter todo-api dev      # http://localhost:4000

# 4. Run the frontend (separate terminal)
pnpm --filter todo-web dev      # http://localhost:5173, proxies /api to :4000
```

## 19. Known limitations

- **No relations/joins.** Single-table CRUD and filtering only.
- **No migrations.** The Todo app creates its table with a plain SQL
  statement at startup; there's no schema-diffing or versioned migration
  system.
- **No transactions.** Each `ModelClient` call is a single independent
  query; there's no `db.transaction(fn)` API.
- **No validation layer beyond TypeScript.** Required-field and type
  checks happen at compile time; there's no runtime schema validation
  (e.g. rejecting a `title: ""` at the ORM level) beyond what Postgres's
  own `NOT NULL` constraint would reject.
- **No CLI.** No `light-orm generate` or similar tooling.
- **`contains` is `LIKE`, not full-text search** — no relevance ranking,
  no indexes created automatically.
- **Package/app boundary is convention, not lint-enforced.** Nothing
  currently fails the build if `apps/todo-app` imported
  `packages/light-orm/src/...` directly; an ESLint `no-restricted-imports`
  rule scoped to the workspace would close this gap.
- **Not published to npm; not deployed.** See §17 and §18 for the exact
  manual steps remaining.

## 20. Design tradeoffs

See [ARCHITECTURE.md § Design tradeoffs](./ARCHITECTURE.md#design-tradeoffs)
for the full list (no relations, no migrations, `LIKE`-based `contains`,
flat AST nodes instead of a chainable query builder) and the reasoning
behind each.

## 21. Future improvements

In the order I'd actually do them: (1) an ESLint boundary rule enforcing
the package/app import boundary, (2) transactions (highest engineering
value relative to complexity, per the assignment's own bonus ranking),
(3) a small migration CLI that diffs `ColumnMeta` against
`information_schema`, (4) basic relations (`belongsTo`/`hasMany`) once
the query AST has a `join` concept.

## 22. AI-tool disclosure

This project was built with substantial assistance from an AI coding
assistant (Claude), which wrote the initial implementation of every layer
described in [ARCHITECTURE.md](./ARCHITECTURE.md) — schema DSL, query AST,
SQL compiler, driver abstraction, client, the Todo API and frontend, and
this documentation — based on a detailed specification. The AI also ran
the build, typecheck, and test suite (including installing a local
Postgres instance to run real integration tests) and iterated on failures.
I reviewed the resulting code and can explain every layer's design and
tradeoffs (see [ARCHITECTURE.md § Interview defensibility topics]) —
the [interview expectations](#interview-defensibility) list in
ARCHITECTURE.md is exactly what I used to check my own understanding
before submitting.

## 23. Actual time spent

_[Fill in honestly before submitting — e.g. "~X hours across N sessions:
Y hours on the ORM core, Z hours on the Todo app and docs." The AI
assistant did the majority of the typing in a single working session;
your own review/understanding time should go here.]_

---

## FAQ-relevant notes

- **Multiple databases:** not supported by design — Postgres only.
- **Frontend framework:** React + Vite, per the assignment's
  recommendation.
- **Backend framework:** Express, chosen for minimal ceremony.
- **Driver:** `pg` (node-postgres), a standard, well-maintained Postgres
  client compatible with serverless Postgres providers over a normal TCP
  connection.
