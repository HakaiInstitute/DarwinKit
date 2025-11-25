/**
 * Field Mapping Schemas
 *
 * Effect schemas for field mapping configuration validation.
 * Defines how CSV columns map to Darwin Core fields and specifies
 * validation rules for cross-dataset relationships.
 */

import * as S from "effect/Schema";

// Individual field mapping from CSV column to Darwin Core field
export const FieldMappingSchema = S.Struct({
  originName: S.String,
  darwinCoreFieldName: S.String,
  isRequired: S.optional(S.Boolean),
  customValidationRules: S.optional(S.Array(S.String)),
});

// Cross-dataset validation rule (e.g., foreign key relationships)
export const CrossDatasetRuleSchema = S.Struct({
  ruleType: S.Literal("foreignKey", "referentialIntegrity"),
  sourceField: S.String,
  targetDataset: S.String,
  targetField: S.String,
  description: S.optional(S.String),
});

// Complete field mapping configuration for a dataset
export const FieldMappingConfigSchema = S.Struct({
  version: S.String,
  datasetName: S.String,
  datasetType: S.Literal(
    "event",
    "occurrence",
    "extendedMeasurementOrFacts",
    "resourceRelationship",
  ),
  fieldMappings: S.Array(FieldMappingSchema),
  crossDatasetRules: S.optional(S.Array(CrossDatasetRuleSchema)),
  validationSettings: S.optional(S.Struct({
    enforceUniqueness: S.Boolean,
    enforceRequiredFields: S.Boolean,
    enforceControlledVocabularies: S.Boolean,
  })),
  createdAt: S.Date,
  updatedAt: S.Date,
});
