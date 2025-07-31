/**
 * Transformation Demo
 * 
 * Tests transformation functions on mock data, both standalone and as part of mapping pipeline.
 */

import { MOCK_VOCABULARIES } from './mapping-demo.js';

// Mock data representing various input formats that need transformation
export const MOCK_TRANSFORMATION_DATA = {
  // Raw field values before transformation
  rawFieldValues: {
    sex: ['M', 'F', 'male', 'FEMALE', 'unknown', 'hermaphrodite', ''],
    lifeStage: ['adult', 'JUVENILE', 'larva', 'Adult', 'egg', 'unknown', ''],
    preparations: ['dried', 'ALCOHOL', 'frozen', 'Pinned', 'slide mount', ''],
    coordinates: ['40.7128', '-74.0060', '40.7128, -74.0060', '40°42\'46.08"N', ''],
    dates: ['2023-01-15', '15/01/2023', '2023-1-15', 'January 15, 2023', ''],
    identificationRemarks: ['  confident ID  ', 'UNCERTAIN', 'needs verification', ''],
  },

  // Mapped data from previous mapping step (simulates mapping pipeline output)
  mappedData: [
    {
      sex: 'M',
      lifeStage: 'adult', 
      preparations: 'dried',
      decimalLatitude: '40.7128',
      decimalLongitude: '-74.0060',
      eventDate: '2023-01-15',
      identificationRemarks: '  confident ID  '
    },
    {
      sex: 'FEMALE',
      lifeStage: 'JUVENILE',
      preparations: 'ALCOHOL', 
      decimalLatitude: '40.7128, -74.0060',
      decimalLongitude: '',
      eventDate: '15/01/2023',
      identificationRemarks: 'UNCERTAIN'
    },
    {
      sex: 'unknown',
      lifeStage: 'larva',
      preparations: 'frozen',
      decimalLatitude: '40°42\'46.08"N',
      decimalLongitude: '74°0\'21.6"W',
      eventDate: 'January 15, 2023',
      identificationRemarks: 'needs verification'
    }
  ],

  // Expected outputs after transformation
  expectedOutputs: {
    sex: ['male', 'female', 'male', 'female', 'unknown', 'hermaphrodite', ''],
    lifeStage: ['adult', 'juvenile', 'larva', 'adult', 'egg', 'unknown', ''],
    preparations: ['dried', 'alcohol', 'frozen', 'pinned', 'slide mount', ''],
    coordinates: [40.7128, -74.0060, 40.7128, 40.7128, null],
    dates: ['2023-01-15', '2023-01-15', '2023-01-15', '2023-01-15', ''],
    identificationRemarks: ['confident ID', 'uncertain', 'needs verification', '']
  }
};

// Mock function definitions (simulates what would be stored in database)
export const MOCK_TRANSFORMATION_FUNCTIONS = {
  // Controlled vocabulary transformation functions
  normalizeControlledVocabulary: {
    id: 1,
    name: 'normalizeControlledVocabulary',
    type: 'transformation',
    description: 'Transform input value to canonical vocabulary term',
    parameters: [
      {
        name: 'vocabularyName',
        type: 'string',
        required: true,
        description: 'Name of controlled vocabulary to use'
      },
      {
        name: 'defaultValue',
        type: 'string',
        required: false,
        defaultValue: 'unknown',
        description: 'Default value when no match found'
      },
      {
        name: 'caseSensitive',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: 'Whether matching should be case sensitive'
      }
    ]
  },

  // String transformation functions
  trimWhitespace: {
    id: 2,
    name: 'trimWhitespace',
    type: 'transformation',
    description: 'Remove leading and trailing whitespace',
    parameters: [
      {
        name: 'sides',
        type: 'string',
        required: false,
        defaultValue: 'both',
        description: 'Which sides to trim: both, left, right'
      }
    ]
  },

  toLowerCase: {
    id: 3,
    name: 'toLowerCase',
    type: 'transformation',
    description: 'Convert string to lowercase',
    parameters: []
  },

  // Coordinate transformation functions
  parseCoordinates: {
    id: 4,
    name: 'parseCoordinates',
    type: 'transformation',
    description: 'Parse coordinate strings to decimal degrees',
    parameters: [
      {
        name: 'inputFormat',
        type: 'string',
        required: false,
        defaultValue: 'auto',
        description: 'Expected input format: auto, decimal, dms, combined'
      },
      {
        name: 'precision',
        type: 'number',
        required: false,
        defaultValue: 6,
        description: 'Number of decimal places to round to'
      }
    ]
  },

  // Date transformation functions
  parseDate: {
    id: 5,
    name: 'parseDate',
    type: 'transformation',
    description: 'Parse date strings to ISO format',
    parameters: [
      {
        name: 'inputFormat',
        type: 'string',
        required: false,
        defaultValue: 'auto',
        description: 'Expected input format: auto, iso, us, uk, verbose'
      },
      {
        name: 'outputFormat',
        type: 'string',
        required: false,
        defaultValue: 'iso',
        description: 'Output format: iso, us, uk'
      }
    ]
  }
};

// Mock transformation configuration
export const MOCK_TRANSFORMATION_CONFIG = {
  transformations: [
    {
      field: 'sex',
      functions: [
        {
          functionName: 'normalizeControlledVocabulary',
          parameters: {
            vocabularyName: 'dwc:sex',
            defaultValue: 'unknown',
            caseSensitive: false
          }
        }
      ]
    },
    {
      field: 'lifeStage',
      functions: [
        {
          functionName: 'normalizeControlledVocabulary',
          parameters: {
            vocabularyName: 'dwc:life_stage',
            defaultValue: 'unknown',
            caseSensitive: false
          }
        }
      ]
    },
    {
      field: 'preparations',
      functions: [
        {
          functionName: 'normalizeControlledVocabulary',
          parameters: {
            vocabularyName: 'dwc:preparations',
            defaultValue: 'unknown',
            caseSensitive: false
          }
        }
      ]
    },
    {
      field: 'identificationRemarks',
      functions: [
        {
          functionName: 'trimWhitespace',
          parameters: { sides: 'both' }
        },
        {
          functionName: 'toLowerCase',
          parameters: {}
        }
      ]
    },
    {
      field: 'decimalLatitude',
      functions: [
        {
          functionName: 'parseCoordinates',
          parameters: {
            inputFormat: 'auto',
            precision: 6
          }
        }
      ]
    },
    {
      field: 'eventDate',
      functions: [
        {
          functionName: 'parseDate',
          parameters: {
            inputFormat: 'auto',
            outputFormat: 'iso'
          }
        }
      ]
    }
  ]
};

// Test scenarios
export const TRANSFORMATION_TEST_SCENARIOS = [
  {
    name: 'Controlled Vocabulary Transformation',
    input: 'M',
    field: 'sex',
    expected: 'male',
    description: 'Transform sex value using controlled vocabulary'
  },
  {
    name: 'Case-Insensitive Vocabulary Match',
    input: 'FEMALE',
    field: 'sex', 
    expected: 'female',
    description: 'Match vocabulary term regardless of case'
  },
  {
    name: 'Synonym Resolution',
    input: 'M',
    field: 'sex',
    expected: 'male',
    description: 'Resolve synonym to canonical term'
  },
  {
    name: 'String Transformation Chain',
    input: '  confident ID  ',
    field: 'identificationRemarks',
    expected: 'confident id',
    description: 'Apply multiple string transformations in sequence'
  },
  {
    name: 'Coordinate Parsing',
    input: '40.7128, -74.0060',
    field: 'decimalLatitude',
    expected: 40.7128,
    description: 'Parse combined coordinate string'
  },
  {
    name: 'Date Format Standardization',
    input: '15/01/2023',
    field: 'eventDate',
    expected: '2023-01-15',
    description: 'Convert date to ISO format'
  }
];

import { 
  executeFieldTransformation, 
  executeDatasetTransformation, 
  validateTransformationConfig,
  generateExecutionSummary
} from '../lib/transformation-executor.js';

// Execute transformation demo
export function runTransformationDemo() {
  console.log('=== Transformation Demo Execution ===\n');

  // 1. Validate configuration
  console.log('1. Validating transformation configuration...');
  const configValidation = validateTransformationConfig(MOCK_TRANSFORMATION_CONFIG);
  
  if (!configValidation.valid) {
    console.error('Configuration validation failed:', configValidation.errors);
    return;
  }
  console.log('✓ Configuration is valid\n');

  // 2. Test individual field transformations
  console.log('2. Testing individual field transformations...');
  for (const scenario of TRANSFORMATION_TEST_SCENARIOS) {
    console.log(`\nTesting: ${scenario.name}`);
    console.log(`Input: "${scenario.input}" → Expected: "${scenario.expected}"`);

    const fieldConfig = MOCK_TRANSFORMATION_CONFIG.transformations.find(
      t => t.field === scenario.field
    );

    if (!fieldConfig) {
      console.log(`❌ No configuration found for field: ${scenario.field}`);
      continue;
    }

    const result = executeFieldTransformation(
      scenario.input,
      fieldConfig,
      { vocabularies: MOCK_VOCABULARIES }
    );

    console.log(`Output: "${result.transformedValue}"`);
    console.log(`Success: ${result.success}`);
    
    if (!result.success) {
      console.log(`Errors: ${result.errors.join(', ')}`);
    }

    // Check if result matches expected
    const matches = result.transformedValue === scenario.expected;
    console.log(`${matches ? '✓' : '❌'} Test ${matches ? 'PASSED' : 'FAILED'}`);
  }

  // 3. Test dataset transformation
  console.log('\n3. Testing dataset transformation...');
  const datasetResult = executeDatasetTransformation(
    MOCK_TRANSFORMATION_DATA.mappedData,
    MOCK_TRANSFORMATION_CONFIG,
    { vocabularies: MOCK_VOCABULARIES }
  );

  console.log(`Dataset transformation success: ${datasetResult.success}`);
  console.log(`Processed ${datasetResult.processedRows}/${datasetResult.totalRows} rows`);

  if (datasetResult.errors.length > 0) {
    console.log('\nErrors encountered:');
    datasetResult.errors.forEach(error => console.log(`  - ${error}`));
  }

  // 4. Display transformed data
  console.log('\n4. Transformed dataset:');
  MOCK_TRANSFORMATION_DATA.mappedData.forEach((row, index) => {
    console.log(`\nRow ${index + 1}:`);
    Object.entries(row).forEach(([field, value]) => {
      console.log(`  ${field}: "${value}"`);
    });
  });

  // 5. Generate execution summary
  console.log('\n5. Execution Summary:');
  const summary = generateExecutionSummary(datasetResult);
  console.log(`Total fields processed: ${summary.totalFields}`);
  console.log(`Total transformation steps: ${summary.totalSteps}`);
  console.log(`Successful steps: ${summary.successfulSteps}`);
  console.log(`Failed steps: ${summary.failedSteps}`);

  console.log('\nField-by-field results:');
  Object.entries(summary.fieldSummaries).forEach(([fieldName, fieldSummary]) => {
    console.log(`\n  ${fieldName}:`);
    console.log(`    Successful: ${fieldSummary.successfulTransformations}/${fieldSummary.totalValues}`);
    console.log(`    Failed: ${fieldSummary.failedTransformations}/${fieldSummary.totalValues}`);
    if (fieldSummary.mostCommonErrors.length > 0) {
      console.log(`    Common errors: ${fieldSummary.mostCommonErrors.join(', ')}`);
    }
  });

  console.log('\n=== Transformation Demo Complete ===');
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTransformationDemo();
}