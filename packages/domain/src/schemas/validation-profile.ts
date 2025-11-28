/**
 * Effect schemas for validation profiles
 */

import * as S from "effect/Schema";
import { ValidatorConfigSchema } from "../specs/validators.ts";

// Field requirement level schema
export const fieldRequirementLevelSchema = S.Literal(
  "required",
  "strongly-recommended",
  "recommended",
  "required-if-exists",
  "optional",
);

// Field override schema
export const fieldOverrideSchema = S.Struct({
  requirement: S.optional(fieldRequirementLevelSchema),
  validators: S.optional(S.Array(ValidatorConfigSchema)),
  enforcement: S.optional(S.Literal("required", "recommended", "optional")),
});

// Field schema for transform use (raw field metadata from JSON schema)
// Renamed from fieldSchema to make its purpose clearer
export const transformFieldSchema = S.Struct({
  type: S.optional(S.String),
  unique: S.optional(S.String),
  values: S.optional(S.Record({ key: S.String, value: S.Unknown })),
});

// Re-export as fieldSchema for backward compatibility
export const fieldSchema = transformFieldSchema;

// Import NormalizedFieldSchema for validation use
import { NormalizedFieldSchema } from "../specs/normalized-field.ts";

// Validation profile schema
export const validationProfileSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.String,
  targetSchema: S.Literal("obis", "gbif", "custom"),
  extends: S.optional(S.String),
  fieldOverrides: S.Record({ key: S.String, value: fieldOverrideSchema }),

  // Dual-purpose field storage:
  // - fields: Raw field metadata for SQL DDL generation (transform functionality)
  // - normalizedFields: Processed fields with structured validators for validation logic
  fields: S.optional(S.Record({ key: S.String, value: transformFieldSchema })),
  normalizedFields: S.optional(S.Record({ key: S.String, value: NormalizedFieldSchema })),

  documentationUrl: S.optional(S.String),
  version: S.optional(S.String),
  metadata: S.optional(S.Struct({
    createdAt: S.Date,
    updatedAt: S.Date,
    author: S.optional(S.String),
  })),
});

// Validation profile registry schema
export const validationProfileRegistrySchema = S.Record({
  key: S.String,
  value: validationProfileSchema,
});
