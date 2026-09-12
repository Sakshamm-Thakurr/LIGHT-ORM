import { compile } from "../compiler/sql.js";
import type { DatabaseDriver } from "../driver/driver.js";
import { mapFirstRow, mapRows } from "../mapper/mapper.js";
import type { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from "../query/ast.js";
import { buildConditions, buildInsertPlan, buildUpdatePlan } from "../query/builders.js";
import type { AnyColumnBuilder } from "../schema/column.js";
import type {
  AnyModelSchema,
  ModelCreateInput,
  ModelRow,
  ModelSchema,
  ModelUpdateInput,
  ModelWhereInput,
} from "../schema/model.js";

export interface FindManyArgs<Columns> {
  where?: ModelWhereInput<Columns>;
  limit?: number;
}

export interface FindFirstArgs<Columns> {
  where?: ModelWhereInput<Columns>;
}

export interface UpdateArgs<Columns> {
  where: ModelWhereInput<Columns>;
  data: ModelUpdateInput<Columns>;
}

export interface DeleteArgs<Columns> {
  where: ModelWhereInput<Columns>;
}

export interface ModelClient<Columns extends Record<string, AnyColumnBuilder>> {
  findMany(args?: FindManyArgs<Columns>): Promise<ModelRow<Columns>[]>;
  findFirst(args?: FindFirstArgs<Columns>): Promise<ModelRow<Columns> | null>;
  create(data: ModelCreateInput<Columns>): Promise<ModelRow<Columns>>;
  update(args: UpdateArgs<Columns>): Promise<ModelRow<Columns>[]>;
  delete(args: DeleteArgs<Columns>): Promise<ModelRow<Columns>[]>;
}

export type Database<Models extends Record<string, AnyModelSchema>> = {
  [K in keyof Models]: Models[K] extends ModelSchema<any, infer Columns> ? ModelClient<Columns> : never;
};

export interface QueryLogEntry {
  readonly operation: "create" | "findMany" | "findFirst" | "update" | "delete";
  readonly model: string;
  readonly sql: string;
  /** Parameter count only - actual values are never logged by default. */
  readonly parameterCount: number;
  readonly durationMs: number;
}

export interface CreateDatabaseConfig<Models extends Record<string, AnyModelSchema>> {
  driver: DatabaseDriver;
  models: Models;
  /** Optional observability hook, e.g. for a debug panel. Never receives raw parameter values. */
  onQuery?: (entry: QueryLogEntry) => void;
}

function createModelClient<Columns extends Record<string, AnyColumnBuilder>>(
  driver: DatabaseDriver,
  modelName: string,
  columns: Columns,
  onQuery?: (entry: QueryLogEntry) => void,
): ModelClient<Columns> {
  const allColumnNames = Object.keys(columns).sort();

  async function run<T>(
    operation: QueryLogEntry["operation"],
    query: SelectQuery | InsertQuery | UpdateQuery | DeleteQuery,
  ): Promise<T[]> {
    const compiled = compile(query);
    const start = performance.now();
    const rows = await driver.query<T>(compiled.sql, compiled.parameters);
    onQuery?.({
      operation,
      model: modelName,
      sql: compiled.sql,
      parameterCount: compiled.parameters.length,
      durationMs: performance.now() - start,
    });
    return rows;
  }

  return {
    async findMany(args) {
      const query: SelectQuery = {
        kind: "select",
        table: modelName,
        columns: allColumnNames,
        where: buildConditions(args?.where as Record<string, unknown> | undefined),
        limit: args?.limit,
      };
      return mapRows<ModelRow<Columns>>(await run("findMany", query));
    },

    async findFirst(args) {
      const query: SelectQuery = {
        kind: "select",
        table: modelName,
        columns: allColumnNames,
        where: buildConditions(args?.where as Record<string, unknown> | undefined),
        limit: 1,
      };
      return mapFirstRow<ModelRow<Columns>>(await run("findFirst", query));
    },

    async create(data) {
      const plan = buildInsertPlan(columns, data as Record<string, unknown>);
      const query: InsertQuery = {
        kind: "insert",
        table: modelName,
        columns: plan.columns,
        values: plan.values,
        returning: allColumnNames,
      };
      const created = mapFirstRow<ModelRow<Columns>>(await run("create", query));
      if (!created) {
        throw new Error(`create() on "${modelName}" did not return a row`);
      }
      return created;
    },

    async update(args) {
      const plan = buildUpdatePlan(args.data as Record<string, unknown>);
      const query: UpdateQuery = {
        kind: "update",
        table: modelName,
        setColumns: plan.columns,
        set: plan.values,
        where: buildConditions(args.where as Record<string, unknown>),
        returning: allColumnNames,
      };
      return mapRows<ModelRow<Columns>>(await run("update", query));
    },

    async delete(args) {
      const query: DeleteQuery = {
        kind: "delete",
        table: modelName,
        where: buildConditions(args.where as Record<string, unknown>),
        returning: allColumnNames,
      };
      return mapRows<ModelRow<Columns>>(await run("delete", query));
    },
  };
}

/**
 * Builds the typed `db` object: one `ModelClient` per entry in `models`,
 * all sharing the same driver. This is the only function that bridges
 * "static" schema types and the runtime client objects.
 */
export function createDatabase<Models extends Record<string, AnyModelSchema>>(
  config: CreateDatabaseConfig<Models>,
): Database<Models> {
  const db = {} as Record<string, ModelClient<any>>;
  for (const [key, model] of Object.entries(config.models)) {
    db[key] = createModelClient(config.driver, model.name, model.columns, config.onQuery);
  }
  return db as Database<Models>;
}
