import { createDatabase, createPostgresDriver, type QueryLogEntry } from "@sakshamthakur/light-orm";
import { Todo } from "./models.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill in a Postgres connection string.");
  process.exit(1);
}

// Local/dev Postgres instances usually don't present a CA-signed cert;
// serverless providers (Neon, Supabase) require TLS. Detect the common
// local-development case so `pnpm dev:api` works out of the box.
const isLocalConnection = /localhost|127\.0\.0\.1/.test(connectionString);

export const driver = createPostgresDriver({ connectionString, ssl: !isLocalConnection });

function logQuery(entry: QueryLogEntry): void {
  // Deliberately logs SQL shape and timing only - never parameter values.
  // eslint-disable-next-line no-console
  console.log(`[db] ${entry.operation} ${entry.model} (${entry.parameterCount} params, ${entry.durationMs.toFixed(1)}ms)`);
}

export const db = createDatabase({
  driver,
  models: { todo: Todo },
  onQuery: logQuery,
});

export const CREATE_TODO_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "todo" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false
);
`;
