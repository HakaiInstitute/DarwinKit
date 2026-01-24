import { colors } from '@cliffy/ansi/colors';
import { Table } from '@cliffy/table';
import { FieldViolation, WorkspaceValidationResult } from '@dwkt/domain';
import { Output } from '../../utils/output.ts';

export function outputTableResults(results: WorkspaceValidationResult): void {
  Output.blank();
  Output.section('Workspace Validation Completed');
  Output.muted(`Configuration: ${results.configPath}`);
  Output.blank();

  // Create summary table
  const table = new Table()
    .header(['Dataset', 'Spec', 'Status', 'Errors', 'Warnings', 'Info'])
    .border(true);

  for (const dataset of results.datasetResults) {
    const statusText = Output.statusText(dataset.status);

    const errorCount = dataset.schemaViolations.errors.length +
      dataset.fieldViolations.errors.length;

    const warningCount = dataset.schemaViolations.warnings.length +
      dataset.fieldViolations.warnings.length;

    const infoCount = dataset.schemaViolations.info.length +
      dataset.fieldViolations.info.length;

    table.push([
      dataset.datasetName,
      dataset.spec,
      statusText,
      errorCount > 0 ? colors.red(errorCount.toString()) : errorCount.toString(),
      warningCount > 0 ? colors.yellow(warningCount.toString()) : warningCount.toString(),
      infoCount > 0 ? colors.blue(infoCount.toString()) : infoCount.toString(),
    ]);
  }

  table.render();
  Output.blank();

  // Show detailed errors, warnings, and info by severity
  for (const dataset of results.datasetResults) {
    const hasSchemaErrors = dataset.schemaViolations.errors.length > 0;
    const hasSchemaWarnings = dataset.schemaViolations.warnings.length > 0;
    const hasSchemaInfo = dataset.schemaViolations.info.length > 0;
    const hasSchemaViolations = hasSchemaErrors || hasSchemaWarnings || hasSchemaInfo;

    const hasFieldErrors = dataset.fieldViolations.errors.length > 0;
    const hasFieldWarnings = dataset.fieldViolations.warnings.length > 0;
    const hasFieldInfo = dataset.fieldViolations.info.length > 0;
    const hasFieldViolations = hasFieldErrors || hasFieldWarnings || hasFieldInfo;

    if (hasSchemaViolations || hasFieldViolations) {
      Output.blank();
      Output.bold(`${dataset.datasetName} (${dataset.spec})`);
    }

    // ============================================================================
    // SCHEMA ISSUES (structural/mapping problems)
    // ============================================================================
    if (hasSchemaViolations) {
      Output.blank();
      Output.muted('  Schema Issues:');

      // Schema Errors
      if (hasSchemaErrors) {
        Output.error(`    ${colors.bold('ERRORS')} (${dataset.schemaViolations.errors.length}):`);
        for (const violation of dataset.schemaViolations.errors) {
          Output.error(`      • ${violation.errorMessage}`);
        }
      }

      // Schema Warnings
      if (hasSchemaWarnings) {
        Output.warning(
          `    ${colors.bold('WARNINGS')} (${dataset.schemaViolations.warnings.length}):`,
        );
        for (const violation of dataset.schemaViolations.warnings) {
          Output.warning(`      • ${violation.errorMessage}`);
        }
      }

      // Schema Info
      if (hasSchemaInfo) {
        Output.info(`    ${colors.bold('INFO')} (${dataset.schemaViolations.info.length}):`);
        for (const violation of dataset.schemaViolations.info) {
          Output.info(`      • ${violation.errorMessage}`);
        }
      }
    }

    // ============================================================================
    // DATA VALIDATION (row-level issues)
    // ============================================================================
    if (hasFieldViolations) {
      Output.blank();
      Output.muted('  Data Validation:');

      // Field Errors
      if (hasFieldErrors) {
        Output.error(`    ${colors.bold('ERRORS')} (${dataset.fieldViolations.errors.length}):`);
        const errorsByField = groupViolationsByField(dataset.fieldViolations.errors);
        for (const [fieldName, violations] of errorsByField) {
          const firstViolation = violations[0];
          Output.error(
            `      • ${fieldName} (${firstViolation.validatorType}): ${violations.length} violations`,
          );

          const examples = violations.slice(0, 3);
          for (const violation of examples) {
            Output.muted(`        - Row ${violation.rowNumber}: ${violation.errorMessage}`);
          }

          if (violations.length > 3) {
            Output.muted(`        ... and ${violations.length - 3} more violations`);
          }
        }
      }

      // Field Warnings
      if (hasFieldWarnings) {
        Output.warning(
          `    ${colors.bold('WARNINGS')} (${dataset.fieldViolations.warnings.length}):`,
        );
        const warningsByField = groupViolationsByField(dataset.fieldViolations.warnings);
        for (const [fieldName, violations] of warningsByField) {
          const firstViolation = violations[0];
          Output.warning(
            `      • ${fieldName} (${firstViolation.validatorType}): ${violations.length} violations`,
          );

          const examples = violations.slice(0, 3);
          for (const violation of examples) {
            Output.muted(`        - Row ${violation.rowNumber}: ${violation.errorMessage}`);
          }

          if (violations.length > 3) {
            Output.muted(`        ... and ${violations.length - 3} more violations`);
          }
        }
      }

      // Field Info
      if (hasFieldInfo) {
        Output.info(`    ${colors.bold('INFO')} (${dataset.fieldViolations.info.length}):`);
        const infoByField = groupViolationsByField(dataset.fieldViolations.info);
        for (const [fieldName, violations] of infoByField) {
          const firstViolation = violations[0];
          Output.info(
            `      • ${fieldName} (${firstViolation.validatorType}): ${violations.length} violations`,
          );

          const examples = violations.slice(0, 3);
          for (const violation of examples) {
            Output.muted(`        - Row ${violation.rowNumber}: ${violation.errorMessage}`);
          }

          if (violations.length > 3) {
            Output.muted(`        ... and ${violations.length - 3} more violations`);
          }
        }
      }
    }

    if (hasSchemaViolations || hasFieldViolations) {
      Output.blank();
    }
  }

  // Helper function to group field violations by field name
  function groupViolationsByField(
    violations: ReadonlyArray<FieldViolation>,
  ): Map<string, FieldViolation[]> {
    const grouped = new Map<string, FieldViolation[]>();

    for (const violation of violations) {
      if (!grouped.has(violation.fieldName)) {
        grouped.set(violation.fieldName, []);
      }
      grouped.get(violation.fieldName)!.push(violation);
    }

    return grouped;
  }

  // Show cross-dataset validation results
  if (results.crossDatasetResults.length > 0) {
    Output.section('Cross-dataset Validation');
    Output.blank();

    for (const crossResult of results.crossDatasetResults) {
      if (crossResult.violations.length > 0) {
        Output.error(
          `Foreign key violation: ${crossResult.sourceDataset}.${crossResult.sourceField} → ${crossResult.targetDataset}.${crossResult.targetField}`,
        );

        const sampleViolations = crossResult.violations.slice(0, 5);
        for (const violation of sampleViolations) {
          Output.error(`  • Row ${violation.rowNumber}: ${violation.errorMessage}`);
        }

        if (crossResult.violations.length > 5) {
          Output.muted(`  ... and ${crossResult.violations.length - 5} more violations`);
        }
        Output.blank();
      } else {
        Output.success(
          `Foreign key valid: ${crossResult.sourceDataset}.${crossResult.sourceField} → ${crossResult.targetDataset}.${crossResult.targetField}`,
        );
      }
    }
    Output.blank();
  }

  Output.bold('Summary:');
  Output.line(`  Datasets processed: ${results.summary.totalDatasets}`);
  Output.line(`  ${colors.green('Passed')}: ${results.summary.datasetsPassedCount}`);
  Output.line(`  ${colors.yellow('Warnings')}: ${results.summary.datasetsWithWarningsCount}`);
  Output.line(`  ${colors.red('Failed')}: ${results.summary.datasetsFailedCount}`);
  Output.blank();
  Output.line(`  ${colors.bold(colors.red('Errors'))}: ${results.summary.totalErrors}`);
  Output.line(`  ${colors.bold(colors.yellow('Warnings'))}: ${results.summary.totalWarnings}`);
  Output.line(`  ${colors.bold(colors.blue('Info'))}: ${results.summary.totalInfo}`);
  Output.blank();
  Output.line(`  Total rows processed: ${results.summary.totalRowsProcessed}`);
  Output.line(`  Processing time: ${results.totalProcessingTimeMs}ms`);
  Output.blank();
}
