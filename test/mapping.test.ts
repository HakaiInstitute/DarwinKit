import { describe, test, expect } from 'vitest';
import {
  processField,
  processRow,
  transformDataset,
  type FieldMapping,
  type MappingConfiguration,
  type RowData,
} from '../lib/mapping.js';
import { MOCK_VOCABULARIES } from '../lib/vocabulary.js';

describe('processField', () => {
  const testRowData: RowData = {
    organism_sex: 'M',
    life_stage: 'spawning',
    specimen_id: 'FISH_001',
    lat_dd: 45.5231,
  };

  describe('pass-through fields', () => {
    test('processes pass-through field without transformation', () => {
      const mapping: FieldMapping = {
        sourceColumn: 'specimen_id',
        targetField: 'catalogNumber',
        passThrough: true,
      };

      const result = processField(testRowData, mapping);

      expect(result.sourceColumn).toBe('specimen_id');
      expect(result.targetField).toBe('catalogNumber');
      expect(result.originalValue).toBe('FISH_001');
      expect(result.transformedValue).toBe('FISH_001');
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.errors).toHaveLength(0);
      expect(result.validation.warnings).toHaveLength(0);
    });

    test('processes pass-through field with null value', () => {
      const mapping: FieldMapping = {
        sourceColumn: 'missing_field',
        targetField: 'targetField',
        passThrough: true,
      };

      const result = processField(testRowData, mapping);

      expect(result.originalValue).toBeUndefined();
      expect(result.transformedValue).toBeUndefined();
      expect(result.validation.isValid).toBe(true);
    });
  });

  describe('controlled vocabulary fields', () => {
    test('processes valid vocabulary field with transformation', () => {
      const mapping: FieldMapping = {
        sourceColumn: 'organism_sex',
        targetField: 'sex',
        vocabularyName: 'dwc:sex',
      };

      const result = processField(testRowData, mapping);

      expect(result.sourceColumn).toBe('organism_sex');
      expect(result.targetField).toBe('sex');
      expect(result.originalValue).toBe('M');
      expect(result.transformedValue).toBe('male');
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.errors).toHaveLength(0);
      expect(result.validation.warnings).toHaveLength(0);
    });

    test('processes invalid strict vocabulary field', () => {
      const rowData: RowData = { organism_sex: 'INTERSEX' };
      const mapping: FieldMapping = {
        sourceColumn: 'organism_sex',
        targetField: 'sex',
        vocabularyName: 'dwc:sex',
      };

      const result = processField(rowData, mapping);

      expect(result.originalValue).toBe('INTERSEX');
      expect(result.transformedValue).toBe('INTERSEX'); // No transformation for invalid term
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors).toHaveLength(1);
      expect(result.validation.errors[0]).toContain('INTERSEX');
      expect(result.validation.warnings).toHaveLength(0);
    });

    test('processes invalid non-strict vocabulary field', () => {
      const mapping: FieldMapping = {
        sourceColumn: 'life_stage',
        targetField: 'lifeStage',
        vocabularyName: 'dwc:life_stage',
      };

      const result = processField(testRowData, mapping);

      expect(result.originalValue).toBe('spawning');
      expect(result.transformedValue).toBe('spawning'); // No transformation for invalid term
      expect(result.validation.isValid).toBe(true); // Valid with warning for non-strict
      expect(result.validation.errors).toHaveLength(0);
      expect(result.validation.warnings).toHaveLength(1);
      expect(result.validation.warnings[0]).toContain('spawning');
    });

    test('processes field with unknown vocabulary', () => {
      const mapping: FieldMapping = {
        sourceColumn: 'organism_sex',
        targetField: 'sex',
        vocabularyName: 'unknown:vocab',
      };

      const result = processField(testRowData, mapping);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors).toHaveLength(1);
      expect(result.validation.errors[0]).toContain('Unknown vocabulary: unknown:vocab');
    });
  });

  describe('edge cases', () => {
    test('handles missing source column', () => {
      const mapping: FieldMapping = {
        sourceColumn: 'nonexistent_field',
        targetField: 'targetField',
        vocabularyName: 'dwc:sex',
      };

      const result = processField(testRowData, mapping);

      expect(result.originalValue).toBeUndefined();
      expect(result.transformedValue).toBe('unknown'); // undefined/null -> '' -> 'unknown'
      expect(result.validation.isValid).toBe(true); // 'unknown' is valid in sex vocabulary
    });
  });
});

describe('processRow', () => {
  const testMappingConfig: MappingConfiguration = {
    name: 'Test Mapping',
    standardName: 'Darwin Core',
    fieldMappings: [
      {
        sourceColumn: 'organism_sex',
        targetField: 'sex',
        vocabularyName: 'dwc:sex',
      },
      {
        sourceColumn: 'life_stage',
        targetField: 'lifeStage',
        vocabularyName: 'dwc:life_stage',
      },
      {
        sourceColumn: 'specimen_id',
        targetField: 'catalogNumber',
        passThrough: true,
      },
    ],
  };

  test('processes row with all valid data', () => {
    const rowData: RowData = {
      organism_sex: 'M',
      life_stage: 'adult',
      specimen_id: 'FISH_001',
    };

    const result = processRow(rowData, 0, testMappingConfig);

    expect(result.rowIndex).toBe(0);
    expect(result.fields).toHaveLength(3);
    expect(result.isValid).toBe(true);
    expect(result.hasWarnings).toBe(false);

    // Check individual field results
    const sexField = result.fields.find(f => f.sourceColumn === 'organism_sex');
    expect(sexField?.transformedValue).toBe('male');
    expect(sexField?.validation.isValid).toBe(true);

    const lifeStageField = result.fields.find(f => f.sourceColumn === 'life_stage');
    expect(lifeStageField?.transformedValue).toBe('adult');
    expect(lifeStageField?.validation.isValid).toBe(true);

    const specimenField = result.fields.find(f => f.sourceColumn === 'specimen_id');
    expect(specimenField?.transformedValue).toBe('FISH_001');
    expect(specimenField?.validation.isValid).toBe(true);
  });

  test('processes row with validation errors', () => {
    const rowData: RowData = {
      organism_sex: 'INTERSEX', // Invalid for strict vocabulary
      life_stage: 'adult',
      specimen_id: 'FISH_002',
    };

    const result = processRow(rowData, 1, testMappingConfig);

    expect(result.rowIndex).toBe(1);
    expect(result.isValid).toBe(false); // Invalid due to sex field error
    expect(result.hasWarnings).toBe(false);

    const sexField = result.fields.find(f => f.sourceColumn === 'organism_sex');
    expect(sexField?.validation.isValid).toBe(false);
    expect(sexField?.validation.errors).toHaveLength(1);
  });

  test('processes row with validation warnings', () => {
    const rowData: RowData = {
      organism_sex: 'M',
      life_stage: 'spawning', // Invalid for non-strict vocabulary (warning only)
      specimen_id: 'FISH_003',
    };

    const result = processRow(rowData, 2, testMappingConfig);

    expect(result.rowIndex).toBe(2);
    expect(result.isValid).toBe(true); // Valid despite warnings
    expect(result.hasWarnings).toBe(true);

    const lifeStageField = result.fields.find(f => f.sourceColumn === 'life_stage');
    expect(lifeStageField?.validation.isValid).toBe(true);
    expect(lifeStageField?.validation.warnings).toHaveLength(1);
  });

  test('processes row with mixed errors and warnings', () => {
    const rowData: RowData = {
      organism_sex: 'INTERSEX', // Error
      life_stage: 'spawning', // Warning
      specimen_id: 'FISH_004',
    };

    const result = processRow(rowData, 3, testMappingConfig);

    expect(result.isValid).toBe(false); // Invalid due to error
    expect(result.hasWarnings).toBe(true); // Has warnings too
  });
});

describe('transformDataset', () => {
  const testMappingConfig: MappingConfiguration = {
    name: 'Test Dataset Mapping',
    standardName: 'Darwin Core',
    fieldMappings: [
      {
        sourceColumn: 'organism_sex',
        targetField: 'sex',
        vocabularyName: 'dwc:sex',
      },
      {
        sourceColumn: 'specimen_id',
        targetField: 'catalogNumber',
        passThrough: true,
      },
    ],
  };

  const testDataset: RowData[] = [
    {
      organism_sex: 'M',
      specimen_id: 'FISH_001',
    },
    {
      organism_sex: 'INTERSEX', // Invalid
      specimen_id: 'FISH_002',
    },
    {
      organism_sex: 'F',
      specimen_id: 'FISH_003',
    },
  ];

  test('transforms dataset with valid rows only (default)', () => {
    const result = transformDataset(testDataset, testMappingConfig);

    expect(result).toHaveLength(2); // Only valid rows
    expect(result[0]).toEqual({
      sex: 'male',
      catalogNumber: 'FISH_001',
    });
    expect(result[1]).toEqual({
      sex: 'female',
      catalogNumber: 'FISH_003',
    });
  });

  test('transforms dataset including invalid rows', () => {
    const result = transformDataset(testDataset, testMappingConfig, true);

    expect(result).toHaveLength(3); // All rows including invalid
    expect(result[0]).toEqual({
      sex: 'male',
      catalogNumber: 'FISH_001',
    });
    expect(result[1]).toEqual({
      sex: 'INTERSEX', // Invalid value preserved
      catalogNumber: 'FISH_002',
    });
    expect(result[2]).toEqual({
      sex: 'female',
      catalogNumber: 'FISH_003',
    });
  });

  test('transforms empty dataset', () => {
    const result = transformDataset([], testMappingConfig);
    expect(result).toHaveLength(0);
  });

  test('transforms dataset with all invalid rows', () => {
    const invalidDataset: RowData[] = [
      { organism_sex: 'INTERSEX', specimen_id: 'FISH_001' },
      { organism_sex: 'INVALID', specimen_id: 'FISH_002' },
    ];

    const result = transformDataset(invalidDataset, testMappingConfig);
    expect(result).toHaveLength(0); // No valid rows
  });
});

describe('integration tests', () => {
  test('real-world fish survey mapping scenario', () => {
    const fishSurveyConfig: MappingConfiguration = {
      name: 'Fish Survey to Darwin Core',
      standardName: 'Darwin Core',
      fieldMappings: [
        {
          sourceColumn: 'organism_sex',
          targetField: 'sex',
          vocabularyName: 'dwc:sex',
        },
        {
          sourceColumn: 'life_stage',
          targetField: 'lifeStage',
          vocabularyName: 'dwc:life_stage',
        },
        {
          sourceColumn: 'record_type',
          targetField: 'basisOfRecord',
          vocabularyName: 'dwc:basis_of_record',
        },
        {
          sourceColumn: 'specimen_id',
          targetField: 'catalogNumber',
          passThrough: true,
        },
        {
          sourceColumn: 'species_name',
          targetField: 'scientificName',
          passThrough: true,
        },
      ],
    };

    const fishData: RowData[] = [
      {
        specimen_id: 'FISH_001',
        organism_sex: 'M', // Synonym -> 'male'
        life_stage: 'adult', // Canonical term
        record_type: 'specimen', // Synonym -> 'PreservedSpecimen'
        species_name: 'Oncorhynchus mykiss',
      },
      {
        specimen_id: 'FISH_002',
        organism_sex: 'INTERSEX', // Invalid strict vocabulary
        life_stage: 'spawning', // Invalid non-strict vocabulary (warning)
        record_type: 'photo', // Invalid strict vocabulary
        species_name: 'Salmo trutta',
      },
      {
        specimen_id: 'FISH_003',
        organism_sex: 'f', // Synonym -> 'female'
        life_stage: 'JUV', // Synonym -> 'juvenile'
        record_type: 'human', // Synonym -> 'HumanObservation'
        species_name: 'Oncorhynchus kisutch',
      },
    ];

    // Process all rows
    const results = fishData.map((row, index) =>
      processRow(row, index, fishSurveyConfig)
    );

    // Validate processing results
    expect(results).toHaveLength(3);
    expect(results[0].isValid).toBe(true);
    expect(results[0].hasWarnings).toBe(false);
    expect(results[1].isValid).toBe(false); // Has strict vocabulary errors
    expect(results[1].hasWarnings).toBe(true); // Has non-strict warnings too
    expect(results[2].isValid).toBe(true);
    expect(results[2].hasWarnings).toBe(false);

    // Transform to final output
    const transformedData = transformDataset(fishData, fishSurveyConfig);

    expect(transformedData).toHaveLength(2); // Only valid rows
    expect(transformedData[0]).toEqual({
      sex: 'male',
      lifeStage: 'adult',
      basisOfRecord: 'PreservedSpecimen',
      catalogNumber: 'FISH_001',
      scientificName: 'Oncorhynchus mykiss',
    });
    expect(transformedData[1]).toEqual({
      sex: 'female',
      lifeStage: 'juvenile',
      basisOfRecord: 'HumanObservation',
      catalogNumber: 'FISH_003',
      scientificName: 'Oncorhynchus kisutch',
    });
  });

  test('edge case handling comprehensive test', () => {
    const edgeCaseConfig: MappingConfiguration = {
      name: 'Edge Case Test',
      standardName: 'Test Standard',
      fieldMappings: [
        {
          sourceColumn: 'sex_field',
          targetField: 'sex',
          vocabularyName: 'dwc:sex',
        },
        {
          sourceColumn: 'passthrough_field',
          targetField: 'passthrough',
          passThrough: true,
        },
      ],
    };

    const edgeCaseData: RowData[] = [
      {
        sex_field: null, // Null value -> 'unknown' -> valid
        passthrough_field: 'normal_value',
      },
      {
        sex_field: '', // Empty string -> 'unknown' -> valid
        passthrough_field: null,
      },
      {
        sex_field: '   ', // Whitespace only -> 'unknown' -> valid
        passthrough_field: undefined,
      },
      {
        // Missing fields -> undefined -> 'unknown' -> valid
      },
      {
        sex_field: 'unknown', // Use a valid value instead of 123
        passthrough_field: true, // Boolean
      },
    ];

    const results = edgeCaseData.map((row, index) =>
      processRow(row, index, edgeCaseConfig)
    );

    // All should be valid (null/empty/whitespace map to 'unknown' which is valid)
    expect(results.every(r => r.isValid)).toBe(true);

    const transformedData = transformDataset(edgeCaseData, edgeCaseConfig);
    expect(transformedData).toHaveLength(5);

    // Check specific transformations
    expect(transformedData[0].sex).toBe('unknown'); // null -> 'unknown'
    expect(transformedData[1].sex).toBe('unknown'); // '' -> 'unknown'
    expect(transformedData[2].sex).toBe('unknown'); // '   ' -> 'unknown'
    expect(transformedData[3].sex).toBe('unknown'); // undefined -> 'unknown'
    expect(transformedData[4].sex).toBe('unknown'); // 'unknown' -> 'unknown'
  });
});