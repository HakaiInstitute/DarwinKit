import * as S from "effect/Schema";

export const primitiveType = S.Literal(
  "number",
  "string",
  "boolean",
  "date",
  "object",
  "binary",
  "null",
);

// Field schema validation
export const fieldSchemaSchema = S.Struct({
  name: S.String,
  inferredType: S.String,
  primitiveType: primitiveType,
  isNullable: S.Boolean,
  defaultValue: S.optional(S.String),
  sampleValues: S.optional(S.Array(S.String)),
});

// Helper type for the FieldSchema
type FieldSchemaType = S.Schema.Type<typeof fieldSchemaSchema>;

// Dataset schema validation (using array format for JSON compatibility)
export const datasetSchemaSchema = S.Struct({
  fields: S.transform(
    S.Array(S.Tuple(S.String, fieldSchemaSchema)),
    S.instanceOf(Map<string, FieldSchemaType>),
    {
      strict: true,
      decode: (arr) => new Map(arr),
      encode: (map) => Array.from(map.entries()),
    },
  ),
  rowCount: S.Number,
  tableName: S.String,
  inferredAt: S.Date,
});

// Field schema derived from DuckDB column metadata
export type FieldSchema = S.Schema.Type<typeof fieldSchemaSchema>;

// Schema for the entire dataset
export type DatasetSchema = S.Schema.Type<typeof datasetSchemaSchema>;
