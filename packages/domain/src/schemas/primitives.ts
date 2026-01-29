/**
 * Essential common types for MVP - TypeScript aligned
 */

import * as S from "effect/Schema";

// TypeScript & Deno-friendly primitive types
export const PrimitiveTypeSchema = S.Literal(
  "number",
  "string",
  "boolean",
  "date",
  "object",
  "binary",
  "null",
);

// Export as TypeScript types
export type PrimitiveType = S.Schema.Type<typeof PrimitiveTypeSchema>;
