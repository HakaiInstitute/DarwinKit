import * as S from "effect/Schema";
import { ConstraintSchema, RequirementLevel } from "../specs/constraints.ts";
import type { ResolvedField, SpecField } from "../specs/field-definition.ts";

export const fieldOverrideSchema = S.Struct({
  requirement: S.optional(RequirementLevel),
  constraints: S.optional(S.Array(ConstraintSchema)),
});

export const transformFieldSchema = S.Struct({
  type: S.optional(S.String),
  unique: S.optional(S.String),
  values: S.optional(S.Record({ key: S.String, value: S.Unknown })),
});

export type FieldOverride = S.Schema.Type<typeof fieldOverrideSchema>;
export type TransformField = S.Schema.Type<typeof transformFieldSchema>;

/**
 * @internal Use SpecField instead for validation logic.
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

export interface Spec {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly normalizedFields: Record<string, SpecField>;
  /** Raw fields for DDL generation (ENUM types, column types, etc.) */
  readonly rawFields?: Record<string, TransformField>;
  readonly metadata?: { createdAt?: Date; updatedAt?: Date; author?: string };
}

export type SpecRegistry = Record<string, Spec>;

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

export type ProfileRegistry = Record<string, Profile>;

export interface ResolvedSpec {
  readonly id: string;
  readonly name: string;
  readonly spec: string;
  readonly profile?: string;
  readonly fieldOverrides: Record<string, FieldOverride>;
  readonly fields: Record<string, ResolvedField>;
  readonly specFields: Record<string, SpecField>;
  readonly rawFields?: Record<string, TransformField>;
}
