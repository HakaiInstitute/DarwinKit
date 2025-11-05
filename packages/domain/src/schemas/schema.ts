/**
 * Zod schemas for runtime validation
 */

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
  inferredType: S.String, // Raw DuckDB type string
  primitiveType: primitiveType,
  isNullable: S.Boolean,
  defaultValue: S.optional(S.String),
  sampleValues: S.optional(S.Array(S.String)),
});

// Dataset schema validation (using array format for JSON compatibility)
export const datasetSchemaSchema = S.Struct({
  fields: S.Array(S.Tuple(S.String, fieldSchemaSchema)), // Array of [fieldName, fieldSchema] tuples
  rowCount: S.Number,
  tableName: S.String,
  inferredAt: S.Date,
});
