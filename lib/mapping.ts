// Field mapping types and functions extracted from demo for testing

import {
  transformControlledVocabulary,
  validateControlledVocabulary,
  ValidationResult,
  MockVocabulary,
  MOCK_VOCABULARIES,
} from "./vocabulary.js";

export type RowData = Record<string, unknown>;

export interface FieldMapping {
  sourceColumn: string;
  targetField: string;
  vocabularyName?: string;
  strictOverride?: boolean;
  passThrough?: boolean;
}

export interface MappingConfiguration {
  name: string;
  standardName: string;
  fieldMappings: FieldMapping[];
}

export interface FieldResult {
  sourceColumn: string;
  targetField: string;
  originalValue: unknown;
  transformedValue: unknown;
  validation: ValidationResult;
}

export interface RowResult {
  rowIndex: number;
  fields: FieldResult[];
  isValid: boolean;
  hasWarnings: boolean;
}

/**
 * Process a single field mapping
 */
export function processField(
  rowData: RowData,
  mapping: FieldMapping,
  vocabularies: Record<string, MockVocabulary> = MOCK_VOCABULARIES
): FieldResult {
  const originalValue = rowData[mapping.sourceColumn];
  let transformedValue = originalValue;
  let validation: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  if (mapping.passThrough) {
    // Pass-through field: no transformation or validation
    transformedValue = originalValue;
  } else if (mapping.vocabularyName) {
    // Controlled vocabulary field
    transformedValue = transformControlledVocabulary(
      originalValue,
      mapping.vocabularyName,
      vocabularies
    );
    validation = validateControlledVocabulary(
      transformedValue,
      mapping.vocabularyName,
      vocabularies
    );
  }

  return {
    sourceColumn: mapping.sourceColumn,
    targetField: mapping.targetField,
    originalValue,
    transformedValue,
    validation,
  };
}

/**
 * Process a single row
 */
export function processRow(
  rowData: RowData,
  rowIndex: number,
  mappingConfig: MappingConfiguration,
  vocabularies: Record<string, MockVocabulary> = MOCK_VOCABULARIES
): RowResult {
  const fields = mappingConfig.fieldMappings.map((mapping) =>
    processField(rowData, mapping, vocabularies)
  );

  const isValid = fields.every((f) => f.validation.isValid);
  const hasWarnings = fields.some((f) => f.validation.warnings.length > 0);

  return {
    rowIndex,
    fields,
    isValid,
    hasWarnings,
  };
}

/**
 * Transform dataset to target format (only valid rows by default)
 */
export function transformDataset(
  data: RowData[],
  mappingConfig: MappingConfiguration,
  includeInvalidRows = false,
  vocabularies: Record<string, MockVocabulary> = MOCK_VOCABULARIES
): RowData[] {
  const results = data.map((row, index) =>
    processRow(row, index, mappingConfig, vocabularies)
  );

  return results
    .filter((result) => includeInvalidRows || result.isValid)
    .map((result) => {
      const transformedRow: RowData = {};
      result.fields.forEach((field) => {
        transformedRow[field.targetField] = field.transformedValue;
      });
      return transformedRow;
    });
}