/**
 * Essential common types for MVP - TypeScript aligned
 */

import * as S from "effect/Schema";

// TypeScript & Deno-friendly primitive types
export const PrimitiveType = S.Literal(
  "number",
  "string",
  "boolean",
  "date",
  "object",
  "binary",
  "null",
);

export const FileFormat = S.Literal("csv", "json");

// Export as TypeScript types
export type PrimitiveType = S.Schema.Type<typeof PrimitiveType>;
export type FileFormat = S.Schema.Type<typeof FileFormat>;

// Base entity for consistent ID and timestamps
export interface BaseEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
