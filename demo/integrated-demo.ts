/**
 * Integrated Demo
 * 
 * Demonstrates unified mapping + transformation + validation pipeline
 */

import { MOCK_VOCABULARIES } from './mapping-demo.js';
import { 
  IntegratedConfiguration,
  IntegratedFieldConfiguration 
} from '../lib/integrated-configuration.js';
import { 
  executeIntegratedConfiguration,
  validateIntegratedConfiguration 
} from '../lib/integrated-executor.js';

// Sample source data (raw CSV-like data)
const SAMPLE_SOURCE_DATA = [
  {
    organism_sex: 'M',
    life_stage: 'adult',
    lat_long: '40.7128, -74.0060',
    date_collected: '2023-06-15',
    specimen_id: 'FISH_001',
    species: 'Oncorhynchus mykiss',
    collector: 'J. Smith',
    prep_type: 'dried',
    notes: '  healthy specimen  '
  },
  {
    organism_sex: 'FEMALE',
    life_stage: 'JUV',
    lat_long: '41.2524° N, 95.9980° W',
    date_collected: '15/06/2023',
    specimen_id: 'FISH_002',
    species: 'Oncorhynchus kisutch',
    collector: 'A. Brown',
    prep_type: 'ALCOHOL',
    notes: 'uncertain identification'
  },
  {
    organism_sex: '',
    life_stage: 'unknown',
    lat_long: 'invalid coords',
    date_collected: 'June 17, 2023',
    specimen_id: 'FISH_003',
    species: 'Oncorhynchus nerka',
    collector: '',
    prep_type: 'frozen',
    notes: ''
  }
];

// Integrated configuration combining mapping + transformation
const INTEGRATED_CONFIG: IntegratedConfiguration = {
  name: "Fish Survey to Darwin Core - Integrated Pipeline",
  sourceFile: "fish_survey.csv",
  standard: "Darwin Core",
  
  globalParameters: {
    vocabularies: MOCK_VOCABULARIES,
    dateFormat: 'auto',
    coordinatePrecision: 6
  },
  
  fieldMappings: [
    // Sex field: mapping + vocabulary transformation
    {
      sourceColumn: "organism_sex",
      targetField: "sex",
      transformations: [
        {
          functionName: "normalizeControlledVocabulary",
          parameters: {
            vocabularyName: "dwc:sex",
            defaultValue: "unknown",
            caseSensitive: false
          }
        }
      ]
    },
    
    // Life stage field: mapping + vocabulary transformation  
    {
      sourceColumn: "life_stage",
      targetField: "lifeStage",
      transformations: [
        {
          functionName: "normalizeControlledVocabulary",
          parameters: {
            vocabularyName: "dwc:life_stage",
            defaultValue: "unknown",
            caseSensitive: false
          }
        }
      ]
    },
    
    // Latitude extraction: mapping + coordinate parsing
    {
      sourceColumn: "lat_long",
      targetField: "decimalLatitude", 
      transformations: [
        {
          functionName: "parseCoordinates",
          parameters: {
            inputFormat: "auto",
            component: "latitude"
          }
        }
      ]
    },
    
    // Longitude extraction: mapping + coordinate parsing
    {
      sourceColumn: "lat_long", 
      targetField: "decimalLongitude",
      transformations: [
        {
          functionName: "parseCoordinates",
          parameters: {
            inputFormat: "auto", 
            component: "longitude"
          }
        }
      ]
    },
    
    // Date standardization: mapping + date parsing
    {
      sourceColumn: "date_collected",
      targetField: "eventDate",
      transformations: [
        {
          functionName: "parseDate",
          parameters: {
            inputFormat: "auto",
            outputFormat: "iso"
          }
        }
      ]
    },
    
    // Simple mappings (no transformation needed)
    {
      sourceColumn: "specimen_id",
      targetField: "catalogNumber"
    },
    {
      sourceColumn: "species",
      targetField: "scientificName"
    },
    {
      sourceColumn: "collector", 
      targetField: "recordedBy"
    },
    
    // Notes field: mapping + string cleaning
    {
      sourceColumn: "notes",
      targetField: "occurrenceRemarks",
      transformations: [
        {
          functionName: "trimWhitespace",
          parameters: {
            sides: "both"
          }
        }
      ]
    }
  ]
};

// Execute integrated demo
export function runIntegratedDemo() {
  console.log('=== Integrated Mapping + Transformation Demo ===\n');

  // 1. Validate configuration
  console.log('1. Validating integrated configuration...');
  const validation = validateIntegratedConfiguration(INTEGRATED_CONFIG);
  
  if (!validation.valid) {
    console.error('❌ Configuration validation failed:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    return;
  }
  
  console.log('✅ Configuration is valid');
  if (validation.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    validation.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  console.log();

  // 2. Execute integrated pipeline
  console.log('2. Executing integrated pipeline...');
  const result = executeIntegratedConfiguration(SAMPLE_SOURCE_DATA, INTEGRATED_CONFIG);
  
  console.log(`✅ Pipeline execution completed`);
  console.log(`📊 Results: ${result.validRows}/${result.totalRows} rows processed successfully`);
  
  if (result.globalErrors.length > 0) {
    console.log('\n❌ Global errors:');
    result.globalErrors.forEach(error => console.log(`  - ${error}`));
  }
  console.log();

  // 3. Show detailed row-by-row results
  console.log('3. Row-by-row execution details...\n');
  
  for (const rowResult of result.rowResults) {
    const status = rowResult.success ? '✅' : '❌';
    console.log(`${status} Row ${rowResult.rowIndex + 1}:`);
    
    // Show original source data
    const sourceRow = SAMPLE_SOURCE_DATA[rowResult.rowIndex];
    console.log('  📥 Source:', JSON.stringify(sourceRow, null, 4).replace(/\n/g, '\n    '));
    
    // Show field-by-field transformations
    console.log('  🔄 Field transformations:');
    for (const [fieldName, fieldResult] of Object.entries(rowResult.fieldResults)) {
      const fieldStatus = fieldResult.success ? '✅' : '❌';
      console.log(`    ${fieldStatus} ${fieldResult.sourceColumn} → ${fieldName}:`);
      console.log(`      Original: "${fieldResult.originalValue}"`);
      console.log(`      Final: "${fieldResult.finalValue}"`);
      
      // Show transformation steps
      if (fieldResult.transformationSteps.length > 0) {
        console.log('      Steps:');
        for (const step of fieldResult.transformationSteps) {
          const stepStatus = step.success ? '✅' : '❌';
          console.log(`        ${stepStatus} ${step.functionName}: "${step.inputValue}" → "${step.outputValue}"`);
          if (step.error) {
            console.log(`          Error: ${step.error}`);
          }
        }
      }
      
      if (fieldResult.errors.length > 0) {
        console.log(`      Errors: ${fieldResult.errors.join(', ')}`);
      }
    }
    
    // Show final transformed row
    console.log('  📤 Output:', JSON.stringify(rowResult.transformedRow, null, 4).replace(/\n/g, '\n    '));
    console.log();
  }

  // 4. Show execution summary
  console.log('4. Execution Summary:');
  console.log(`   Configuration: ${result.configurationName}`);
  console.log(`   Total rows: ${result.totalRows}`);
  console.log(`   Valid rows: ${result.validRows}`);
  console.log(`   Invalid rows: ${result.invalidRows}`);
  console.log(`   Overall success: ${result.success}`);
  console.log();

  // 5. Field statistics
  console.log('5. Field Statistics:');
  for (const [fieldName, stats] of Object.entries(result.fieldStatistics)) {
    console.log(`   ${fieldName}:`);
    console.log(`     Processed: ${stats.totalProcessed}`);
    console.log(`     Successful: ${stats.successful}`);
    console.log(`     Failed: ${stats.failed}`);
    if (stats.mostCommonErrors.length > 0) {
      console.log(`     Common errors: ${stats.mostCommonErrors.join('; ')}`);
    }
  }
  console.log();

  // 6. Final transformed dataset
  console.log('6. Final Transformed Dataset (Valid Rows Only):');
  console.log(JSON.stringify(result.transformedData, null, 2));

  console.log('\n=== Integrated Demo Complete ===');
}

// Export configuration for testing
export { INTEGRATED_CONFIG, SAMPLE_SOURCE_DATA };

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegratedDemo();
}