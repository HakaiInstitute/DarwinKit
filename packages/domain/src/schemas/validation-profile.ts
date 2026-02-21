/**
 * Type definitions for the specification system
 *
 * Three distinct types model different roles:
 * - Spec: Base schema definitions loaded from JSON (Event, Occurrence, etc.)
 * - Profile: Variant overlays defined in TypeScript (OBIS, OBIS-Event, etc.)
 * - ResolvedSpec: Merged result of Spec + Profile, consumed by validation
 */

import * as S from "effect/Schema";
import { ConstraintSchema, RequirementLevel } from "../specs/constraints.ts";
import type { ResolvedField, SpecField } from "../specs/field-definition.ts";

// =============================================================================
// Shared Schemas
// =============================================================================

/** Field override schema — used by Profiles to override spec field behavior */
export const fieldOverrideSchema = S.Struct({
  requirement: S.optional(RequirementLevel),
  constraints: S.optional(S.Array(ConstraintSchema)),
});

/** Raw field metadata from JSON schema — used for SQL DDL generation */
export const transformFieldSchema = S.Struct({
  type: S.optional(S.String),
  unique: S.optional(S.String),
  values: S.optional(S.Record({ key: S.String, value: S.Unknown })),
});

// =============================================================================
// Derived Types
// =============================================================================

export type FieldOverride = S.Schema.Type<typeof fieldOverrideSchema>;
export type TransformField = S.Schema.Type<typeof transformFieldSchema>;

// =============================================================================
// Raw Field (from JSON schema)
// =============================================================================

/**
 * Raw field definition from JSON schema
 *
 * Represents the raw structure of fields in the dwcSchema.json file.
 *
 * @internal This type is used internally for normalization and should not be used
 * directly in application code. Use SpecField instead for validation logic.
 *
 * Validators can be either strings (legacy format) or typed Constraint objects.
 */
export interface RawField {
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

// =============================================================================
// Spec — Base schema definitions loaded from JSON
// =============================================================================

/**
 * A base Darwin Core schema definition (Event, Occurrence, Taxon, etc.)
 *
 * Loaded from dwcSchema.json. Contains field definitions in two forms:
 * - rawFields: Original JSON format for SQL DDL generation
 * - normalizedFields: Processed SpecField format for validation logic
 */
export interface Spec {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly normalizedFields: Record<string, SpecField>;
  /** Raw fields for DDL generation (ENUM types, column types, etc.) */
  readonly rawFields?: Record<string, TransformField>;
  readonly metadata?: { createdAt?: Date; updatedAt?: Date; author?: string };
}

/** Registry mapping spec IDs to Spec objects */
export type SpecRegistry = Record<string, Spec>;

// =============================================================================
// Profile — Variant overlays defined in TypeScript
// =============================================================================

/**
 * A validation profile that overlays a Spec with community-specific requirements.
 *
 * Profiles (OBIS, OBIS-Event, etc.) define field overrides that strengthen
 * or adjust the base spec's constraints. They don't carry field definitions
 * themselves — those come from the Spec they extend.
 */
export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly extends?: string;
  readonly fieldOverrides: Record<string, FieldOverride>;
  readonly documentationUrl?: string;
  readonly version?: string;
  readonly metadata?: { createdAt?: Date; updatedAt?: Date; author?: string };
}

/** Registry mapping profile IDs to Profile objects */
export type ProfileRegistry = Record<string, Profile>;

// =============================================================================
// ResolvedSpec — Merged result for validation
// =============================================================================

/**
 * A fully resolved specification combining a Spec with an optional Profile.
 *
 * This is the merged result consumed by the validation pipeline.
 * Contains all the information needed for both DDL generation and validation.
 */
export interface ResolvedSpec {
  /** Display name (from the Spec) */
  readonly id: string;
  readonly name: string;
  /** Which Spec it came from */
  readonly spec: string;
  /** Which Profile was applied (undefined if base spec only) */
  readonly profile?: string;
  /** Merged field overrides from Spec inheritance and Profile */
  readonly fieldOverrides: Record<string, FieldOverride>;
  /** Resolved fields — obligations baked into constraints, ready for validators */
  readonly fields: Record<string, ResolvedField>;
  /** Spec-level fields with obligations intact (for obligation lookups at DDL/resolution time) */
  readonly specFields: Record<string, SpecField>;
  /** Raw fields from the Spec (for DDL generation) */
  readonly rawFields?: Record<string, TransformField>;
}

// =============================================================================
// Deprecated — ValidationProfile (kept for backward compatibility during migration)
// =============================================================================

// Import SpecField schema for the legacy combined schema
import { SpecFieldSchema } from "../specs/field-definition.ts";

/** @deprecated Use Spec, Profile, or ResolvedSpec instead */
export const validationProfileSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.String,
  targetSchema: S.optional(S.Literal("obis", "gbif")),
  extends: S.optional(S.String),
  fieldOverrides: S.Record({ key: S.String, value: fieldOverrideSchema }),
  fields: S.optional(S.Record({ key: S.String, value: transformFieldSchema })),
  normalizedFields: S.optional(S.Record({ key: S.String, value: SpecFieldSchema })),
  documentationUrl: S.optional(S.String),
  version: S.optional(S.String),
  metadata: S.optional(S.Struct({
    createdAt: S.Date,
    updatedAt: S.Date,
    author: S.optional(S.String),
  })),
});

/** @deprecated Use Spec, Profile, or ResolvedSpec instead */
export const validationProfileRegistrySchema = S.Record({
  key: S.String,
  value: validationProfileSchema,
});

/** @deprecated Use Spec, Profile, or ResolvedSpec instead */
export type ValidationProfile = S.Schema.Type<typeof validationProfileSchema>;
/** @deprecated Use SpecRegistry or ProfileRegistry instead */
export type ValidationProfileRegistry = S.Schema.Type<typeof validationProfileRegistrySchema>;
