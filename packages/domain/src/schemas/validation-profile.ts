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

// Field schema (matches dwcSchema.json structure)
// This is the raw field metadata from external schema definitions
export const fieldSchema = S.Struct({
  group: S.optional(S.String),
  name: S.String,
  label: S.optional(S.String),
  namespace: S.optional(S.String),
  qualName: S.optional(S.String),
  "dc:relation": S.optional(S.String),
  "dc:description": S.optional(S.String),
  examples: S.optional(S.String),
  gbif_required: S.optional(S.String),
  obis_required: S.optional(S.String),
  type: S.optional(S.String),
  unique: S.optional(S.String),
  validators: S.optional(S.Array(S.String)),
  values: S.optional(S.Record({ key: S.String, value: S.Unknown })),
});

// Validation profile schema
export const validationProfileSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.String,
  targetSchema: S.Literal("obis", "gbif", "custom"),
  extends: S.optional(S.String),
  fieldOverrides: S.Record({ key: S.String, value: fieldOverrideSchema }),
  fields: S.optional(S.Record({ key: S.String, value: fieldSchema })),
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
