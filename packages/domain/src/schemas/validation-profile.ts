/**
 * Effect schemas for validation profiles
 */

import * as S from "effect/Schema";
import { Constraint, RequirementLevel } from "../specs/constraints.ts";

// Field override schema
export const fieldOverrideSchema = S.Struct({
  requirement: S.optional(RequirementLevel),
  constraints: S.optional(S.Array(Constraint)),
});

// Field schema for transform use (raw field metadata from JSON schema)
// Renamed from fieldSchema to make its purpose clearer
export const transformFieldSchema = S.Struct({
  type: S.optional(S.String),
  unique: S.optional(S.String),
  values: S.optional(S.Record({ key: S.String, value: S.Unknown })),
});

// Import FieldDefinition for validation use
import { FieldDefinitionSchema } from "../specs/field-definition.ts";

// Validation profile schema
export const validationProfileSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.String,
  targetSchema: S.optional(S.Literal("obis", "gbif", "custom")),
  extends: S.optional(S.String),
  fieldOverrides: S.Record({ key: S.String, value: fieldOverrideSchema }),

  // Dual-purpose field storage:
  // - fields: Raw field metadata for SQL DDL generation (transform functionality)
  // - normalizedFields: Processed fields with structured validators for validation logic
  fields: S.optional(S.Record({ key: S.String, value: transformFieldSchema })),
  normalizedFields: S.optional(S.Record({ key: S.String, value: FieldDefinitionSchema })),

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

/**
 * Raw field definition from JSON schema
 *
 * Represents the raw structure of fields in the dwcSchema.json file.
 *
 * @internal This type is used internally for normalization and should not be used
 * directly in application code. Use NormalizedField instead for validation logic.
 *
 * Validators can be either strings (legacy format) or typed Constraint objects.
 * The lowercase naming indicates this is a raw format from JSON schema.
 */
export interface Field {
  readonly group: string;
  readonly name: string;
  readonly label: string;
  readonly namespace: string;
  readonly qualName: string;
  readonly "dc:relation": string;
  readonly "dc:description": string;
  readonly gbif_required: string;
  readonly type: string;
  readonly obis_required: string;
  readonly validators?: ReadonlyArray<string | Record<string, unknown>>;
  readonly values?: Record<string, unknown>;
  readonly comments?: string;
  readonly examples?: string;
  readonly unique?: string;
}

// Types derived from schemas
export type FieldOverride = S.Schema.Type<typeof fieldOverrideSchema>;
export type ValidationProfile = S.Schema.Type<typeof validationProfileSchema>;
export type ValidationProfileRegistry = S.Schema.Type<typeof validationProfileRegistrySchema>;
