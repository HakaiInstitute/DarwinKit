/**
 * Field Mapping Configuration Types
 *
 * Defines how CSV columns map to Darwin Core fields and specifies
 * validation rules for cross-dataset relationships.
 */

import type * as S from "effect/Schema";
import type {
  CrossDatasetRuleSchema,
  FieldMappingConfigSchema,
  FieldMappingSchema,
} from "../schemas/field-mapping.ts";

// Types derived from schemas
export type FieldMapping = S.Schema.Type<typeof FieldMappingSchema>;
export type CrossDatasetRule = S.Schema.Type<typeof CrossDatasetRuleSchema>;
export type FieldMappingConfig = S.Schema.Type<typeof FieldMappingConfigSchema>;

// Validation result for field mapping (output-only, no schema needed)
export interface FieldMappingValidationResult {
  readonly fieldMapping: FieldMapping;
  readonly isValid: boolean;
  readonly errors: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}
