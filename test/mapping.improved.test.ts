import { describe, test, expect } from 'vitest';
import {
  processField,
  processRow,
  transformDataset,
  type FieldMapping,
  type MappingConfiguration,
  type RowData,
} from '../lib/mapping.js';
import { MOCK_VOCABULARIES, type MockVocabulary } from '../lib/vocabulary.js';

describe('Improved Mapping Tests', () => {
  
  describe('Configuration Validation', () => {
    test('field mapping with missing vocabulary and no passThrough flag', () => {
      const invalidMapping: FieldMapping = {
        sourceColumn: 'test_field',
        targetField: 'test_target',
        // Missing vocabularyName AND passThrough - undefined behavior
      };

      const rowData: RowData = { test_field: 'test_value' };
      const result = processField(rowData, invalidMapping, MOCK_VOCABULARIES);

      // Should handle gracefully - likely as pass-through
      expect(result.originalValue).toBe('test_value');
      expect(result.transformedValue).toBe('test_value');
      expect(result.validation.isValid).toBe(true);
    });

    test('field mapping with conflicting vocabulary and passThrough flags', () => {
      const conflictMapping: FieldMapping = {
        sourceColumn: 'test_field',
        targetField: 'test_target',
        vocabularyName: 'dwc:sex',
        passThrough: true, // Conflicting with vocabulary
      };

      const rowData: RowData = { test_field: 'M' };
      const result = processField(rowData, conflictMapping, MOCK_VOCABULARIES);

      // Should prioritize passThrough (based on current logic)
      expect(result.transformedValue).toBe('M'); // Not transformed to 'male'
      expect(result.validation.isValid).toBe(true);
    });

    test('mapping to non-existent vocabulary', () => {
      const invalidVocabMapping: FieldMapping = {
        sourceColumn: 'test_field',
        targetField: 'test_target',
        vocabularyName: 'nonexistent:vocab',
      };

      const rowData: RowData = { test_field: 'test_value' };
      const result = processField(rowData, invalidVocabMapping, MOCK_VOCABULARIES);

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors[0]).toContain('Unknown vocabulary: nonexistent:vocab');
    });
  });

  describe('Data Type Handling Edge Cases', () => {
    test('numeric values that could be vocabulary terms', () => {
      const customVocab: Record<string, MockVocabulary> = {
        'test:numbers': {
          name: 'test:numbers',
          strict: true,
          terms: [
            { term: '1', synonyms: ['one', 'first'] },
            { term: '2', synonyms: ['two', 'second'] },
          ],
        },
      };

      const mapping: FieldMapping = {
        sourceColumn: 'number_field',
        targetField: 'number_target',
        vocabularyName: 'test:numbers',
      };

      // Test number vs string
      const numberData: RowData = { number_field: 1 };
      const stringData: RowData = { number_field: '1' };

      const numberResult = processField(numberData, mapping, customVocab);
      const stringResult = processField(stringData, mapping, customVocab);

      // Both should be transformed to canonical '1'
      expect(numberResult.transformedValue).toBe('1');
      expect(stringResult.transformedValue).toBe('1');
      expect(numberResult.validation.isValid).toBe(true);
      expect(stringResult.validation.isValid).toBe(true);
    });

    test('boolean values in vocabulary context', () => {
      const booleanVocab: Record<string, MockVocabulary> = {
        'test:boolean': {
          name: 'test:boolean',
          strict: true,
          terms: [
            { term: 'yes', synonyms: ['true', 'TRUE', '1'] },
            { term: 'no', synonyms: ['false', 'FALSE', '0'] },
          ],
        },
      };

      const mapping: FieldMapping = {
        sourceColumn: 'bool_field',
        targetField: 'bool_target',
        vocabularyName: 'test:boolean',
      };

      const testCases = [
        { input: true, expected: 'yes' },
        { input: false, expected: 'no' },
        { input: 'true', expected: 'yes' },
        { input: 'false', expected: 'no' },
      ];

      testCases.forEach(({ input, expected }) => {
        const rowData: RowData = { bool_field: input };
        const result = processField(rowData, mapping, booleanVocab);
        
        expect(result.transformedValue).toBe(expected);
        expect(result.validation.isValid).toBe(true);
      });
    });

    test('array and object values should not crash system', () => {
      const mapping: FieldMapping = {
        sourceColumn: 'complex_field',
        targetField: 'complex_target',
        vocabularyName: 'dwc:sex',
      };

      const testCases = [
        { complex_field: ['male', 'female'] }, // Array
        { complex_field: { sex: 'male' } },    // Object
        { complex_field: new Date() },         // Date object
      ];

      testCases.forEach(rowData => {
        expect(() => {
          const result = processField(rowData, mapping, MOCK_VOCABULARIES);
          // Should not crash, even if result is invalid
          expect(typeof result.validation.isValid).toBe('boolean');
        }).not.toThrow();
      });
    });
  });

  describe('Performance & Scalability', () => {
    test('large dataset processing performance', () => {
      const largeConfig: MappingConfiguration = {
        name: 'Large Dataset Test',
        standardName: 'Darwin Core',
        fieldMappings: [
          {
            sourceColumn: 'sex',
            targetField: 'sex',
            vocabularyName: 'dwc:sex',
          },
          {
            sourceColumn: 'id',
            targetField: 'catalogNumber',
            passThrough: true,
          },
        ],
      };

      // Generate 1000 rows of test data
      const largeDataset: RowData[] = Array.from({ length: 1000 }, (_, i) => ({
        sex: i % 4 === 0 ? 'M' : i % 4 === 1 ? 'F' : i % 4 === 2 ? 'H' : 'U',
        id: `SPECIMEN_${i}`,
      }));

      const startTime = performance.now();
      const results = transformDataset(largeDataset, largeConfig, false, MOCK_VOCABULARIES);
      const endTime = performance.now();

      expect(results).toHaveLength(1000); // All should be valid
      expect(results[0].sex).toBe('male'); // First should be transformed
      expect(results[0].catalogNumber).toBe('SPECIMEN_0');

      // Should complete within reasonable time (< 100ms for 1000 rows)
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(100);
      
      console.log(`Processed 1000 rows in ${processingTime.toFixed(2)}ms`);
    });

    test('memory usage with repeated processing', () => {
      const config: MappingConfiguration = {
        name: 'Memory Test',
        standardName: 'Darwin Core',  
        fieldMappings: [
          {
            sourceColumn: 'sex',
            targetField: 'sex',
            vocabularyName: 'dwc:sex',
          },
        ],
      };

      const testData: RowData[] = [{ sex: 'M' }];

      // Process same data 100 times to check for memory leaks
      for (let i = 0; i < 100; i++) {
        const results = transformDataset(testData, config, false, MOCK_VOCABULARIES);
        expect(results).toHaveLength(1);
        expect(results[0].sex).toBe('male');
      }

      // If we get here without running out of memory, test passes
      expect(true).toBe(true);
    });
  });

  describe('Error Recovery & Resilience', () => {
    test('partial row processing when some fields fail', () => {
      const mixedConfig: MappingConfiguration = {
        name: 'Mixed Success/Failure Test',
        standardName: 'Darwin Core',
        fieldMappings: [
          {
            sourceColumn: 'valid_sex',
            targetField: 'sex',
            vocabularyName: 'dwc:sex',
          },
          {
            sourceColumn: 'invalid_field',
            targetField: 'invalidTarget',
            vocabularyName: 'nonexistent:vocab', // This will fail
          },
          {
            sourceColumn: 'passthrough_field',
            targetField: 'notes',
            passThrough: true, // This should succeed
          },
        ],
      };

      const rowData: RowData = {
        valid_sex: 'M',
        invalid_field: 'test',
        passthrough_field: 'Some notes',
      };

      const result = processRow(rowData, 0, mixedConfig);

      expect(result.isValid).toBe(false); // Overall invalid due to one failure
      expect(result.hasWarnings).toBe(false);

      // Check individual field results
      const sexField = result.fields.find(f => f.sourceColumn === 'valid_sex');
      const invalidField = result.fields.find(f => f.sourceColumn === 'invalid_field');
      const passthroughField = result.fields.find(f => f.sourceColumn === 'passthrough_field');

      expect(sexField?.validation.isValid).toBe(true);
      expect(sexField?.transformedValue).toBe('male');

      expect(invalidField?.validation.isValid).toBe(false);
      expect(invalidField?.validation.errors[0]).toContain('Unknown vocabulary');

      expect(passthroughField?.validation.isValid).toBe(true);
      expect(passthroughField?.transformedValue).toBe('Some notes');
    });

    test('dataset processing continues despite individual row failures', () => {
      const config: MappingConfiguration = {
        name: 'Resilience Test',
        standardName: 'Darwin Core',
        fieldMappings: [
          {
            sourceColumn: 'sex',
            targetField: 'sex',
            vocabularyName: 'dwc:sex',
          },
        ],
      };

      const mixedDataset: RowData[] = [
        { sex: 'M' },          // Valid
        { sex: 'INVALID' },    // Invalid  
        { sex: 'F' },          // Valid
        { sex: 'ALSO_INVALID' }, // Invalid
        { sex: 'H' },          // Valid
      ];

      const results = transformDataset(mixedDataset, config, false, MOCK_VOCABULARIES); // Only valid

      expect(results).toHaveLength(3); // Only valid rows
      expect(results[0].sex).toBe('male');
      expect(results[1].sex).toBe('female');
      expect(results[2].sex).toBe('hermaphrodite');

      const allResults = transformDataset(mixedDataset, config, true, MOCK_VOCABULARIES); // Include invalid

      expect(allResults).toHaveLength(5); // All rows
      expect(allResults[1].sex).toBe('INVALID'); // Invalid preserved
      expect(allResults[3].sex).toBe('ALSO_INVALID'); // Invalid preserved
    });
  });

  describe('Real-World Data Quality Scenarios', () => {
    test('survey data with mixed quality and completeness', () => {
      const surveyConfig: MappingConfiguration = {
        name: 'Real Survey Data',
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
            vocabularyName: 'dwc:life_stage', // Non-strict
          },
          {
            sourceColumn: 'specimen_id',
            targetField: 'catalogNumber',
            passThrough: true,
          },
          {
            sourceColumn: 'collector_notes',
            targetField: 'occurrenceRemarks',
            passThrough: true,
          },
        ],
      };

      const surveyData: RowData[] = [
        // Perfect data
        {
          organism_sex: 'male',
          life_stage: 'adult',
          specimen_id: 'PERFECT_001',
          collector_notes: 'Excellent specimen',
        },
        // Needs transformation but valid
        {
          organism_sex: 'M',
          life_stage: 'juv',
          specimen_id: 'TRANSFORM_002', 
          collector_notes: 'Good condition',
        },
        // Has warnings but processable
        {
          organism_sex: 'F',
          life_stage: 'spawning', // Not in vocabulary but non-strict
          specimen_id: 'WARNING_003',
          collector_notes: 'Observed during spawn',
        },
        // Has errors - not processable
        {
          organism_sex: 'INTERSEX', // Invalid in strict vocabulary
          life_stage: 'adult',
          specimen_id: 'ERROR_004',
          collector_notes: 'Unusual morphology',
        },
        // Incomplete data
        {
          organism_sex: '', // Empty -> unknown
          life_stage: null, // Null -> unknown
          specimen_id: 'INCOMPLETE_005',
          collector_notes: '', // Empty notes OK
        },
      ];

      const results = surveyData.map((row, index) =>
        processRow(row, index, surveyConfig, MOCK_VOCABULARIES)
      );

      // Analyze results
      const validRows = results.filter(r => r.isValid);
      const invalidRows = results.filter(r => !r.isValid);  
      const rowsWithWarnings = results.filter(r => r.hasWarnings);

      expect(validRows).toHaveLength(4); // All except INTERSEX row
      expect(invalidRows).toHaveLength(1); // Only INTERSEX row
      expect(rowsWithWarnings).toHaveLength(1); // Only spawning row

      // Check specific transformations
      expect(results[1].fields.find(f => f.sourceColumn === 'organism_sex')?.transformedValue).toBe('male'); // M -> male
      expect(results[1].fields.find(f => f.sourceColumn === 'life_stage')?.transformedValue).toBe('juvenile'); // juv -> juvenile

      // Check warning content
      const warningField = results[2].fields.find(f => f.sourceColumn === 'life_stage');
      expect(warningField?.validation.warnings[0]).toContain('spawning');
      expect(warningField?.validation.warnings[0]).toContain('recommended vocabulary');

      // Check error content  
      const errorField = results[3].fields.find(f => f.sourceColumn === 'organism_sex');
      expect(errorField?.validation.errors[0]).toContain('INTERSEX');
      expect(errorField?.validation.errors[0]).toContain('not in controlled vocabulary');

      // Transform to final dataset
      const finalData = transformDataset(surveyData, surveyConfig, false, MOCK_VOCABULARIES);
      expect(finalData).toHaveLength(4); // Only valid rows

      // Verify data quality improvement
      const finalSexValues = finalData.map(row => row.sex);
      expect(finalSexValues).toEqual(['male', 'male', 'female', 'unknown']);
      expect(finalSexValues.every(sex => ['male', 'female', 'hermaphrodite', 'unknown'].includes(sex as string))).toBe(true);
    });

    test('data quality metrics and reporting', () => {
      const testConfig: MappingConfiguration = {
        name: 'Quality Metrics Test',
        standardName: 'Darwin Core',
        fieldMappings: [
          {
            sourceColumn: 'sex',
            targetField: 'sex',
            vocabularyName: 'dwc:sex',
          },
          {
            sourceColumn: 'stage',
            targetField: 'lifeStage',
            vocabularyName: 'dwc:life_stage',
          },
        ],
      };

      const qualityTestData: RowData[] = [
        { sex: 'M', stage: 'adult' },          // Perfect
        { sex: 'F', stage: 'spawning' },       // Warning
        { sex: 'INVALID', stage: 'juvenile' }, // Error  
        { sex: '', stage: '' },                // Empty -> transformed
        { sex: 'H', stage: 'custom_stage' },   // Warning
      ];

      const results = qualityTestData.map((row, index) =>
        processRow(row, index, testConfig, MOCK_VOCABULARIES)
      );

      // Calculate quality metrics
      const totalRows = results.length;
      const validRows = results.filter(r => r.isValid).length;
      const rowsWithWarnings = results.filter(r => r.hasWarnings).length;
      const rowsWithErrors = results.filter(r => !r.isValid).length;

      // Field-level error/warning counting
      const fieldErrors: Record<string, number> = {};
      const fieldWarnings: Record<string, number> = {};

      results.forEach(row => {
        row.fields.forEach(field => {
          if (field.validation.errors.length > 0) {
            fieldErrors[field.sourceColumn] = (fieldErrors[field.sourceColumn] || 0) + 1;
          }
          if (field.validation.warnings.length > 0) {
            fieldWarnings[field.sourceColumn] = (fieldWarnings[field.sourceColumn] || 0) + 1;
          }
        });
      });

      // Validate metrics
      expect(totalRows).toBe(5);
      expect(validRows).toBe(4); // 80% success rate
      expect(rowsWithWarnings).toBe(2); // spawning and custom_stage
      expect(rowsWithErrors).toBe(1); // INVALID sex

      expect(fieldErrors['sex']).toBe(1); // One invalid sex
      expect(fieldWarnings['stage']).toBe(2); // Two non-standard stages

      // Quality improvement verification
      const transformedData = transformDataset(qualityTestData, testConfig, false, MOCK_VOCABULARIES);
      const dataQualityScore = transformedData.length / totalRows; // 80%
      expect(dataQualityScore).toBe(0.8);
    });
  });
});