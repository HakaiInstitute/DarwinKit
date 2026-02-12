/**
 * Validator utilities
 *
 * Helper functions for field validation that work with both
 * the normalized FieldDefinition format and raw JSON schema fields.
 */

import type { Field } from "../schemas/validation-profile.ts";
import type { FieldDefinition } from "./field-definition.ts";
import type { VocabularyEnforcement } from "./vocabularies/config.ts";
import type { EnforcementLevel } from "./constraints.ts";

/**
 * Check if a field uses controlled vocabulary
 *
 * Supports multiple field formats:
 * - FieldDefinition: has VocabularyConstraint in constraints array
 * - Raw JSON schema: has 'values' object (used before normalization)
 */
export function hasControlledVocabulary(
  field: FieldDefinition | Field,
): boolean {
  // FieldDefinition format: check for vocabulary constraint in constraints array
  if ("constraints" in field && Array.isArray(field.constraints)) {
    return field.constraints.some((c) =>
      typeof c === "object" && c !== null && "type" in c && c.type === "vocabulary"
    );
  }

  // JSON schema format (has 'values' object - used before normalization)
  if ("values" in field && field.values) {
    return typeof field.values === "object" && Object.keys(field.values).length > 0;
  }

  return false;
}

/**
 * Map VocabularyEnforcement to EnforcementLevel
 *
 * Converts vocabulary-specific enforcement to standard enforcement levels:
 * - strict -> required (ERROR)
 * - recommended -> recommended (WARNING)
 * - loose -> optional (no violations generated - any value accepted)
 */
export function vocabularyEnforcementToStandard(
  vocabEnforcement: VocabularyEnforcement,
): EnforcementLevel {
  switch (vocabEnforcement) {
    case "strict":
      return "required";
    case "recommended":
      return "recommended";
    case "loose":
      return "optional";
  }
}
