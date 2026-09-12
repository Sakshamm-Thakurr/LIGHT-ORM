# Architecture

This document explains how `light-orm` is put together, layer by layer, and
the reasoning behind each decision. It's written to be defensible in an
interview: every layer exists to solve one specific problem, not because
"real ORMs have one."

## The pipeline

```
Model Definition (schema DSL)
        │
        ▼
Schema Metadata (ColumnMeta per column)
        │
        ▼
Typed API (createDatabase / ModelClient)
        │
        ▼
Query Representation (Query AST)
        │
        ▼
SQL Compiler (deterministic, parameterized)
        │
        ▼
Driver (DatabaseDriver interface → Postgres adapter)
        │
        ▼
PostgreSQL
        │
        ▼
Result Mapper (rows → typed objects)
```

Each arrow is a real module boundary in `packages/light-orm/src/`:
`schema/`, `client/`, `query/`, `compiler/`, `driver/`, `mapper/`.

---

## 1. Model Definition — `schema/column.ts`, `schema/model.ts`

**Responsibility.** Let a developer describe a table as data: column names,
JS types, nullability, defaults, and key/generation behavior.

**Why it exists.** Everything downstream — type inference, insert planning,
SQL generation — needs a single source of truth for what a column *is*.
Without it, "is this field required on create?" would have to be answered
ad hoc in three different places.

**Design.** `number()`, `string()`, `boolean()` return an immutable
`ColumnBuilder`. Each modifier (`.notNull()`, `.default(x)`, ...) returns a
*new* builder with updated `meta`, rather than mutating in place — this
keeps column definitions safe to share and makes the builder trivially
testable (assert on `.meta` directly, no hidden state).

**Dependencies.** None — this is the bottom of the dependency graph.
Every other layer imports from here, not the reverse.

**Extension points.** Adding a new base type (e.g. `date()`) means adding
one factory function and one entry in `ColumnDataType`. Adding a new
modifier (e.g. `.unique()`) means adding one field to `ColumnMeta` and one
method to the builder interface.

---

## 2. Schema Metadata → Type Inference — `schema/model.ts`

**Responsibility.** Turn a `Record<string, ColumnBuilder<...>>` into the
four TypeScript shapes the client needs: `ModelRow` (what you get back),
`ModelCreateInput` (what `create()` accepts), `ModelUpdateInput` (what
`update({ data })` accepts), and `ModelWhereInput` (what `where` accepts).

**How it works, concretely.** Each `ColumnBuilder<T, Nullable, HasDefault,
Generated>` carries its JS type and three booleans as *type parameters*
(not just runtime values). A handful of small conditional types read those
parameters:

- `InferColumnType<C>` — `Nullable extends true ? T | null : T`.
- `IsOptionalOnCreate<C>` — true if `HasDefault` or `Generated` is true.
- `ModelCreateInput<Columns>` splits columns into required vs. optional
  keys using `IsOptionalOnCreate`, then builds an intersection type.

This is why `id` (auto-increment) and `completed` (has a default) become
optional on `create()`, while `title` (plain `notNull()`) stays required —
it falls directly out of the column's own type parameters, with no special
casing for "this looks like a primary key."

**Why an intermediate representation of types, not one big generic?**
Each type answers one question (`InferColumnType`, `IsOptionalOnCreate`,
...) so it can be read, tested, and explained independently. A single
mega-generic that computed everything in one pass would be shorter but
unreadable and hard to debug when inference goes wrong.

**Dependencies.** `schema/column.ts` only.

---

## 3. Typed API — `client/client.ts`

**Responsibility.** Turn the static types from step 2 into a runtime
object: `db.todo.create(...)`, `db.todo.findMany(...)`, etc.

**Why it exists as its own layer, separate from the compiler.** The client
knows about *models* (a name + columns + user-facing args). The compiler
knows about *queries* (table + columns + conditions, no model concept at
all). Keeping them separate means the compiler can be tested with hand-built
query objects, with no schema or client involved.

**How it works.** `createDatabase({ driver, models })` loops over
`models` and builds one `ModelClient` per entry. Each `ModelClient` method:

1. Converts user input (`where`, `data`) into plain objects using the
   helpers in `query/builders.ts`.
2. Builds one `Query` AST node (`query/ast.ts`).
3. Calls `compile()` to get `{ sql, parameters }`.
4. Calls `driver.query(sql, parameters)`.
5. Maps the result through `mapper.ts`.

**Dependencies.** `schema/`, `query/`, `compiler/`, `driver/`, `mapper/`.
This is the only layer that depends on all the others — it's the
orchestrator, not a place where SQL or type logic lives.

---

## 4. Query Representation — `query/ast.ts`, `query/builders.ts`

**Responsibility.** A small set of plain data shapes (`SelectQuery`,
`InsertQuery`, `UpdateQuery`, `DeleteQuery`, `Condition`) with **no
methods and no hidden state**.

**Why an intermediate representation at all, instead of building SQL
strings directly in the client?** Three reasons, in order of importance:

1. **Testability.** The compiler can be unit-tested with hand-constructed
   AST objects, with no client, no schema, no database involved. See
   `tests/compiler.test.ts`.
2. **Determinism.** `query/builders.ts` sorts `where` conditions and
   insert/update columns alphabetically *before* they become AST nodes.
   The compiler never has to guess an order — same logical query always
   produces the same AST, and the same AST always produces the same SQL.
3. **Single injection choke point.** Every value that reaches SQL passes
   through exactly one function (`compileWhere`, or the placeholder loops
   in `compile()`). There's no code path where a client method could
   accidentally string-concatenate a value into SQL, because the client
   never sees SQL at all.

**Dependencies.** `errors.ts` only (for `QueryCompilationError` /
`SchemaError`).

---

## 5. SQL Compiler — `compiler/sql.ts`

**Responsibility.** Pure function: `Query → { sql, parameters }`.

**Determinism.** `compile()` has no internal state and reads nothing but
its argument. Given the same `Query` object, it always produces the same
string and the same parameter array in the same order — this is what
`tests/compiler.test.ts` asserts directly, and it's why "deterministic SQL
compilation" is honestly claimed rather than aspirational.

**Security.** Two independent protections, not one:

- **Values** never appear in the SQL string. Every value pushed into
  `parameters` gets a `$n` placeholder instead; `pg` sends the SQL and the
  parameter array separately over the wire, so a `$1` placeholder cannot
  be reinterpreted as SQL syntax no matter what the value contains.
- **Identifiers** (table/column names) go through `quoteIdentifier()`,
  which rejects anything that isn't `^[a-zA-Z_][a-zA-Z0-9_]*$` before
  wrapping it in double quotes. Identifiers can't be parameterized in SQL
  (`$1` can't stand in for a column name), so validating the shape is the
  correct defense here — and it's applied even though identifiers come
  from trusted schema code, not user input, as defense in depth.

**Dependencies.** `query/ast.ts` (types only) and `errors.ts`.

---

## 6. Driver — `driver/driver.ts`, `driver/postgres.ts`

**Responsibility.** `DatabaseDriver` is a one-method interface:
`query<T>(sql, parameters): Promise<T[]>`. Everything above this line
(client, compiler, query AST) only ever talks to that interface.

**Why a driver interface at all?** Two reasons:

1. **Testability without a database.** `tests/support/fake-driver.ts` is
   an in-memory `DatabaseDriver` used across `tests/client.test.ts` — the
   whole CRUD surface is tested without a live connection.
2. **Real portability.** `createPostgresDriver()` wraps `pg`'s `Pool`.
   Swapping in Neon's HTTP-based serverless driver, or a WebSocket driver,
   means writing one new file that implements the same three-line
   interface — no change to the client, compiler, or query layers.

**Serverless design.** The pool is created once, at the point
`createPostgresDriver()` is called, with `max: 3` by default. In a
serverless function, create it once at module scope (outside the request
handler) so warm invocations reuse the pool instead of opening a fresh one
per request — the driver itself holds no other global state.

**Dependencies.** `errors.ts` (to wrap failures into `DatabaseError`
without leaking `DATABASE_URL` or other connection config — only the
underlying driver error's `message` is attached as `detail`).

---

## 7. Result Mapper — `mapper/mapper.ts`

**Responsibility.** `unknown[] → T[]` / `unknown[] → T | null`.

**Why it's a separate (trivial) layer.** `pg` already returns rows as
plain objects keyed by column name, so today this layer is close to an
identity function. It exists as its own step so the client never assumes
anything about the driver's row shape directly — if a future driver
returned e.g. snake_case-wrapped rows, or `bigint`-typed ids that need
`Number()` conversion, this is the one place that would change.

---

## Design tradeoffs

- **No relations/joins.** Filtering and CRUD only. Adding relations would
  require join-aware type inference in `schema/model.ts` and a `join`
  concept in the query AST — deliberately left out of a "minimal" ORM.
- **No migrations.** The demo app creates its one table with a plain
  `CREATE TABLE IF NOT EXISTS` at startup (see `apps/todo-app/src/db.ts`).
  A real migration system was considered as the bonus feature but skipped
  in favor of keeping the required system solid (see README's bonus
  section).
- **`contains` compiles to `LIKE`, not full-text search.** Good enough for
  a Todo app; a case-insensitive or trigram-indexed search is a
  reasonable follow-up, not a core requirement.
- **The query AST has one node per SQL statement type, not a generic
  builder pattern.** A generic builder (`.select().where().and()...`) is
  more "chainable" but harder to keep deterministic, since the same query
  could be assembled in different call orders. Flat, fully-formed AST
  nodes sidestep that entirely.

## How this would extend

- **Add a `User` model:** call `defineModel("user", { ... })` and add it
  to the `models` map passed to `createDatabase`. No other file changes.
- **Add joins:** extend `SelectQuery` with an optional `join` field
  (table, `on` condition), teach `compile()` to emit `JOIN ... ON ...`,
  and extend `ModelRow` inference to merge the related model's columns
  under a nested key.
- **Add transactions:** add a `transaction(fn)` helper on `Database` that
  checks out a single client from the pool (via a new `DatabaseDriver`
  method, e.g. `withConnection`), runs `BEGIN`/`COMMIT`/`ROLLBACK` around
  `fn`, and passes a `DatabaseDriver`-shaped object bound to that
  connection into `fn` so the same `db.todo.create(...)` calls work inside
  a transaction.
- **Add migrations:** a CLI that diffs `ColumnMeta` for each model against
  the database's `information_schema` and emits `ALTER TABLE` statements —
  a separate package/binary, not a change to the runtime client.
- **Support another SQL dialect (e.g. MySQL):** implement a new
  `DatabaseDriver`, and adjust `quoteIdentifier` (MySQL uses backticks)
  and placeholder syntax (`?` instead of `$n`) behind a small compiler
  "dialect" option — the AST layer wouldn't need to change at all.
