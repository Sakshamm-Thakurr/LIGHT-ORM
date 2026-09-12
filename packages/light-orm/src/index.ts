// Schema DSL
export { number, string, boolean } from "./schema/column.js";
export type { AnyColumnBuilder, ColumnBuilder, ColumnMeta, ColumnDataType } from "./schema/column.js";
export { defineModel } from "./schema/model.js";
export type {
  AnyModelSchema,
  ModelSchema,
  ModelRow,
  ModelCreateInput,
  ModelUpdateInput,
  ModelWhereInput,
  InferColumnType,
  WhereValue,
} from "./schema/model.js";

// Client
export { createDatabase } from "./client/client.js";
export type { Database, ModelClient, CreateDatabaseConfig, QueryLogEntry } from "./client/client.js";

// Query representation (exported for advanced use / tests / tooling)
export type { Query, SelectQuery, InsertQuery, UpdateQuery, DeleteQuery, Condition, ComparisonOperator } from "./query/ast.js";

// Compiler (exported so consumers can compile+inspect SQL without a live DB)
export { compile, quoteIdentifier } from "./compiler/sql.js";
export type { CompiledSql } from "./compiler/sql.js";

// Driver
export type { DatabaseDriver } from "./driver/driver.js";
export { createPostgresDriver } from "./driver/postgres.js";
export type { PostgresDriver, PostgresDriverOptions } from "./driver/postgres.js";

// Errors
export { OrmError, SchemaError, QueryCompilationError, DatabaseError } from "./errors.js";
