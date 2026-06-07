import * as S from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

export const primitiveType = S.Literals([
  "number",
  "string",
  "boolean",
  "date",
  "object",
  "binary",
  "null",
]);

export const fieldSchemaSchema = S.Struct({
  name: S.String,
  inferredType: S.String,
  primitiveType: primitiveType,
  isNullable: S.Boolean,
  defaultValue: S.optional(S.String),
  sampleValues: S.optional(S.Array(S.String)),
});

type FieldSchemaType = typeof fieldSchemaSchema.Type;

// Using array format for JSON compatibility
export const datasetSchemaSchema = S.Struct({
  fields: S.Array(S.Tuple([S.String, fieldSchemaSchema])).pipe(
    S.decodeTo(
      S.instanceOf(Map<string, FieldSchemaType>),
      SchemaTransformation.transform<
        Map<string, FieldSchemaType>,
        ReadonlyArray<readonly [string, FieldSchemaType]>
      >({
        decode: (arr) => new Map(arr),
        encode: (map) => Array.from(map.entries()),
      }),
    ),
  ),
  rowCount: S.Number,
  tableName: S.String,
  inferredAt: S.DateFromString,
});

export type FieldSchema = typeof fieldSchemaSchema.Type;
export type DatasetSchema = typeof datasetSchemaSchema.Type;
