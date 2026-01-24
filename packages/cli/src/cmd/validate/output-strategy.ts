/**
 * Output strategy service for validation command.
 * Provides different output behaviors for table vs JSON formats using Effect's service pattern.
 */

import { colors } from '@cliffy/ansi/colors';
import { Table } from '@cliffy/table';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Match from 'effect/Match';

import type { Workspace } from '@dwkt/core';
import type { FieldViolation, WorkspaceValidationResult } from '@dwkt/domain';
import { Output } from '../../utils/output.ts';
import { withSpinner } from '../../utils/spinner.ts';
import { displayWorkspaceInfo } from '../../utils/workspace-display.ts';

/**
 * Output strategy interface defining how validation results are displayed
 */
export interface OutputStrategyService {
  /**
   * Run an operation with optional spinner feedback
   */
  readonly withProgress: <A, E>(
    message: string,
    operation: () => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>;

  /**
   * Display workspace information
   */
  readonly displayWorkspace: (workspace: Workspace) => Effect.Effect<void>;

  /**
   * Output validation results
   */
  readonly outputResults: (results: WorkspaceValidationResult) => Effect.Effect<void>;

  /**
   * Handle and display errors
   */
  readonly handleError: (error: unknown) => Effect.Effect<number>;
}

/**
 * OutputStrategy service tag for dependency injection
 */
export class OutputStrategy extends Context.Tag('OutputStrategy')<
  OutputStrategy,
  OutputStrategyService
>() {}

/**
 * Table output strategy - shows all human-readable output with spinners and formatting
 * Outputs all content to stdout for traditional CLI experience
 */
export const TableOutputStrategy = Layer.succeed(
  OutputStrategy,
  {
    withProgress: (message, operation) => withSpinner({ message }, operation),

    displayWorkspace: (workspace) => Effect.sync(() => displayWorkspaceInfo(workspace)),

    outputResults: (results) =>
      Effect.sync(() => {
        outputTableResults(results);
        displayValidationSummary(results);
      }),

    handleError: (error) => handleErrorToStdout(error),
  },
);

/**
 * JSON output strategy - silent operation, only outputs clean JSON to stdout
 * Errors are written to stderr to keep stdout clean for piping
 */
export const JsonOutputStrategy = Layer.succeed(
  OutputStrategy,
  {
    withProgress: (_message, operation) => operation(),

    displayWorkspace: (_workspace) => Effect.void,

    outputResults: (results) =>
      Effect.sync(() => {
        console.log(JSON.stringify(results, null, 2));
      }),

    handleError: (error) => handleErrorToStderr(error),
  },
);

/**
 * Display validation summary with overall status.
 */
function displayValidationSummary(results: WorkspaceValidationResult): void {
  Output.line(`Overall status: ${results.overallStatus.toUpperCase()}`);
  Output.line(
    `Datasets: ${results.summary.datasetsPassedCount} passed, ${results.summary.datasetsWithWarningsCount} warnings, ${results.summary.datasetsFailedCount} failed`,
  );
  Output.blank();

  // Display status message with appropriate styling
  switch (results.overallStatus) {
    case 'fail':
      Output.error('Overall status: FAILED');
      Output.muted('   Fix the errors above before proceeding.');
      break;
    case 'warn':
      Output.warning('Overall status: PASSED with warnings');
      Output.muted('   Consider reviewing the warnings above.');
      break;
    case 'pass':
      Output.success('Overall status: PASSED');
      break;
    default:
      Output.error('Unknown validation status');
  }
}

function outputTableResults(results: WorkspaceValidationResult): void {
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

/**
 * Handle errors by displaying appropriate messages to stdout and returning an exit code.
 * Used for table output format where all output goes to stdout.
 */
function handleErrorToStdout(error: unknown): Effect.Effect<number> {
  return Effect.sync(() => {
    if (typeof error !== 'object' || error === null || !('_tag' in error)) {
      Output.error('Unexpected error:');
      Output.error(String(error));
      return 3;
    }

    return Match.value(error as { _tag: string }).pipe(
      Match.tag('ConfigNotFoundError', (err) => {
        Output.error('Configuration Error:');
        Output.error((err as { message: string }).message);
        Output.blank();
        Output.warning('Hint: Create a darwinkit.json configuration file.');
        Output.warning('   See documentation for configuration format.');
        return 3;
      }),
      Match.tag('ConfigParseError', (err) => {
        const e = err as { message: string; configPath?: string };
        Output.error('Configuration parse error:');
        Output.error(e.message);
        if (e.configPath) {
          Output.muted(`Config file: ${e.configPath}`);
        }
        return 3;
      }),
      Match.tag('ConfigValidationError', (err) => {
        const e = err as { message: string; validationErrors?: readonly string[] };
        Output.error('Configuration validation failed:');
        Output.error(e.message);
        if (e.validationErrors) {
          Output.blank();
          Output.error('Validation errors:');
          for (const validationErr of e.validationErrors) {
            Output.error(`  • ${validationErr}`);
          }
        }
        return 3;
      }),
      Match.tag('ConfigMissingSettingsError', (err) => {
        Output.error('Configuration Error:');
        Output.error((err as { message: string }).message);
        Output.blank();
        Output.warning('Hint: Add the required configuration section to your darwinkit.json file.');
        return 3;
      }),
      Match.tag('DatasetFileNotFoundError', (err) => {
        const e = err as { message: string; datasetName: string; filePath: string };
        Output.error('Dataset file not found:');
        Output.error(e.message);
        Output.muted(`Dataset: ${e.datasetName}`);
        Output.muted(`Path: ${e.filePath}`);
        return 3;
      }),
      Match.tag('WorkspaceValidationError', (err) => {
        const e = err as { message: string; cause?: Error };
        Output.error('Workspace error:');
        Output.error(e.message);
        if (e.cause) {
          Output.muted(`Cause: ${e.cause.message}`);
        }
        return 1;
      }),
      Match.orElse(() => {
        Output.error('Unexpected error:');
        Output.error(String(error));
        return 3;
      }),
    );
  });
}

/**
 * Handle errors by displaying appropriate messages to stderr and returning an exit code.
 * Used for JSON output format to keep stdout clean for machine-readable data.
 */
function handleErrorToStderr(error: unknown): Effect.Effect<number> {
  return Effect.sync(() => {
    if (typeof error !== 'object' || error === null || !('_tag' in error)) {
      console.error(colors.red('Unexpected error:'));
      console.error(colors.red(String(error)));
      return 3;
    }

    return Match.value(error as { _tag: string }).pipe(
      Match.tag('ConfigNotFoundError', (err) => {
        console.error(colors.red('Configuration Error:'));
        console.error(colors.red((err as { message: string }).message));
        console.error('');
        console.error(colors.yellow('Hint: Create a darwinkit.json configuration file.'));
        console.error(colors.yellow('   See documentation for configuration format.'));
        return 3;
      }),
      Match.tag('ConfigParseError', (err) => {
        const e = err as { message: string; configPath?: string };
        console.error(colors.red('Configuration parse error:'));
        console.error(colors.red(e.message));
        if (e.configPath) {
          console.error(colors.gray(`Config file: ${e.configPath}`));
        }
        return 3;
      }),
      Match.tag('ConfigValidationError', (err) => {
        const e = err as { message: string; validationErrors?: readonly string[] };
        console.error(colors.red('Configuration validation failed:'));
        console.error(colors.red(e.message));
        if (e.validationErrors) {
          console.error('');
          console.error(colors.red('Validation errors:'));
          for (const validationErr of e.validationErrors) {
            console.error(colors.red(`  • ${validationErr}`));
          }
        }
        return 3;
      }),
      Match.tag('ConfigMissingSettingsError', (err) => {
        console.error(colors.red('Configuration Error:'));
        console.error(colors.red((err as { message: string }).message));
        console.error('');
        console.error(
          colors.yellow(
            'Hint: Add the required configuration section to your darwinkit.json file.',
          ),
        );
        return 3;
      }),
      Match.tag('DatasetFileNotFoundError', (err) => {
        const e = err as { message: string; datasetName: string; filePath: string };
        console.error(colors.red('Dataset file not found:'));
        console.error(colors.red(e.message));
        console.error(colors.gray(`Dataset: ${e.datasetName}`));
        console.error(colors.gray(`Path: ${e.filePath}`));
        return 3;
      }),
      Match.tag('WorkspaceValidationError', (err) => {
        const e = err as { message: string; cause?: Error };
        console.error(colors.red('Workspace error:'));
        console.error(colors.red(e.message));
        if (e.cause) {
          console.error(colors.gray(`Cause: ${e.cause.message}`));
        }
        return 1;
      }),
      Match.orElse(() => {
        console.error(colors.red('Unexpected error:'));
        console.error(colors.red(String(error)));
        return 3;
      }),
    );
  });
}
