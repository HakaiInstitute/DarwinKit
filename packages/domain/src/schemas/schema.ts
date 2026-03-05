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

export const fieldSchemaSchema = S.Struct({
  name: S.String,
  inferredType: S.String,
  primitiveType: primitiveType,
  isNullable: S.Boolean,
  defaultValue: S.optional(S.String),
  sampleValues: S.optional(S.Array(S.String)),
});

type FieldSchemaType = S.Schema.Type<typeof fieldSchemaSchema>;

// Using array format for JSON compatibility
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

export type FieldSchema = S.Schema.Type<typeof fieldSchemaSchema>;
export type DatasetSchema = S.Schema.Type<typeof datasetSchemaSchema>;
