/**
 * The schema layer. This is the ONLY place that knows about column
 * metadata (nullability, defaults, keys). Everything downstream
 * (query building, compilation, mapping) treats a column as data,
 * never as a special TypeScript trick.
 *
 * Each column builder carries a runtime `meta` object (used by the
 * client at request time) and a phantom `_type` marker that exists
 * purely so TypeScript can infer the JS type of the column. `_type`
 * is never assigned a real value - it is erased at compile time.
 */

export type ColumnDataType = "number" | "string" | "boolean";

export interface ColumnMeta {
  dataType: ColumnDataType;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
}

export interface ColumnBuilder<
  T,
  Nullable extends boolean = false,
  HasDefault extends boolean = false,
  Generated extends boolean = false,
> {
  /** Phantom field: never set at runtime, used only for `infer T` in type helpers. */
  readonly _type: T;
  readonly _nullable: Nullable;
  readonly _hasDefault: HasDefault;
  readonly _generated: Generated;
  readonly meta: ColumnMeta;

  /** Marks the column as the table's primary key. Implies the column is generated. */
  primaryKey(): ColumnBuilder<T, Nullable, HasDefault, true>;

  /** Marks the column as an auto-incrementing identity column. Implies generated. */
  autoIncrement(): ColumnBuilder<T, Nullable, HasDefault, true>;

  /** Marks the column NOT NULL (this is already the default). */
  notNull(): ColumnBuilder<T, false, HasDefault, Generated>;

  /** Marks the column nullable; the inferred type becomes `T | null`. */
  nullable(): ColumnBuilder<T, true, HasDefault, Generated>;

  /** Attaches a default value, making the column optional on `create`. */
  default(value: T): ColumnBuilder<T, Nullable, true, Generated>;
}

/** Any concrete column builder, used where the specific generics don't matter. */
export type AnyColumnBuilder = ColumnBuilder<any, boolean, boolean, boolean>;

function createBuilder<T>(dataType: ColumnDataType, meta: ColumnMeta): ColumnBuilder<T, any, any, any> {
  return {
    _type: undefined as unknown as T,
    _nullable: meta.nullable as any,
    _hasDefault: meta.hasDefault as any,
    _generated: (meta.isPrimaryKey || meta.isAutoIncrement) as any,
    meta,
    primaryKey() {
      return createBuilder<T>(dataType, { ...meta, isPrimaryKey: true });
    },
    autoIncrement() {
      return createBuilder<T>(dataType, { ...meta, isAutoIncrement: true });
    },
    notNull() {
      return createBuilder<T>(dataType, { ...meta, nullable: false });
    },
    nullable() {
      return createBuilder<T>(dataType, { ...meta, nullable: true });
    },
    default(value: T) {
      return createBuilder<T>(dataType, { ...meta, hasDefault: true, defaultValue: value });
    },
  };
}

function baseMeta(dataType: ColumnDataType): ColumnMeta {
  return {
    dataType,
    nullable: false,
    hasDefault: false,
    defaultValue: undefined,
    isPrimaryKey: false,
    isAutoIncrement: false,
  };
}

export function number(): ColumnBuilder<number> {
  return createBuilder<number>("number", baseMeta("number"));
}

export function string(): ColumnBuilder<string> {
  return createBuilder<string>("string", baseMeta("string"));
}

export function boolean(): ColumnBuilder<boolean> {
  return createBuilder<boolean>("boolean", baseMeta("boolean"));
}
