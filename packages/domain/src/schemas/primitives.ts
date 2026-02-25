import * as S from "effect/Schema";

export const PrimitiveTypeSchema = S.Literal(
  "number",
  "string",
  "boolean",
  "date",
  "object",
  "binary",
  "null",
);

export type PrimitiveType = S.Schema.Type<typeof PrimitiveTypeSchema>;
