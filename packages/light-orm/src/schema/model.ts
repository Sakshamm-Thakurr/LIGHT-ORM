import type { AnyColumnBuilder, ColumnBuilder } from "./column.js";

export interface ModelSchema<Name extends string, Columns extends Record<string, AnyColumnBuilder>> {
  readonly name: Name;
  readonly columns: Columns;
}

/** Any model schema, used where the specific generics don't matter. */
export type AnyModelSchema = ModelSchema<string, Record<string, AnyColumnBuilder>>;

export function defineModel<Name extends string, Columns extends Record<string, AnyColumnBuilder>>(
  name: Name,
  columns: Columns,
): ModelSchema<Name, Columns> {
  return { name, columns };
}

// ---------------------------------------------------------------------------
// Type inference helpers.
//
// These are intentionally small and named after what they compute, rather
// than being one large generic. Each one answers a single question so the
// whole system stays readable and explainable in an interview.
// ---------------------------------------------------------------------------

/** The JS type a column produces when read back from the database. */
export type InferColumnType<C> = C extends ColumnBuilder<infer T, infer Nullable, any, any>
  ? Nullable extends true
    ? T | null
    : T
  : never;

/** True if a column may be omitted from `create()` (it has a default or is DB-generated). */
type IsOptionalOnCreate<C> = C extends ColumnBuilder<any, any, infer HasDefault, infer Generated>
  ? HasDefault extends true
    ? true
    : Generated extends true
      ? true
      : false
  : false;

type RequiredCreateKeys<Columns> = {
  [K in keyof Columns]: IsOptionalOnCreate<Columns[K]> extends true ? never : K;
}[keyof Columns];

type OptionalCreateKeys<Columns> = {
  [K in keyof Columns]: IsOptionalOnCreate<Columns[K]> extends true ? K : never;
}[keyof Columns];

/** The full row shape returned by SELECT / RETURNING. */
export type ModelRow<Columns> = {
  [K in keyof Columns]: InferColumnType<Columns[K]>;
};

/**
 * The shape accepted by `create()`. Required fields are the columns with
 * no default and no generation strategy; everything else is optional.
 */
export type ModelCreateInput<Columns> = { [K in RequiredCreateKeys<Columns>]: InferColumnType<Columns[K]> } & {
  [K in OptionalCreateKeys<Columns>]?: InferColumnType<Columns[K]>;
};

/** The shape accepted by `update({ data })`: every column is optional. */
export type ModelUpdateInput<Columns> = Partial<{
  [K in keyof Columns]: InferColumnType<Columns[K]>;
}>;

/**
 * Per-field filter value: either a plain equality value, or an object of
 * comparison operators. `contains` only makes sense for string columns.
 */
export type WhereValue<T> = T extends string
  ? T | { equals?: T; contains?: string }
  : T | { equals?: T; gt?: T; gte?: T; lt?: T; lte?: T };

/** The shape accepted by `where`: every column is an optional filter. */
export type ModelWhereInput<Columns> = Partial<{
  [K in keyof Columns]: WhereValue<InferColumnType<Columns[K]>>;
}>;
