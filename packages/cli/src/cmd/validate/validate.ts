import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { Table } from '@cliffy/table';
import { Workspace } from '@dwkt/core';
import type { ValidationViolation, WorkspaceValidationResult } from '@dwkt/domain';
import { join } from '@std/path';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Match from 'effect/Match';
import { CLIError, OutputError } from '../../errors.ts';
import { Output } from '../../utils/output.ts';
import { ProgressSpinner } from '../../utils/spinner.ts';

// Structured output function
function outputResults(
  results: WorkspaceValidationResult,
  format: 'table' | 'json',
  outputDir?: string,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    if (format === 'json') {
      yield* _(outputJsonResultsEffect(results, outputDir));
    } else {
      outputTableResults(results);
    }
  });
}

// Effect-wrapped JSON output
function outputJsonResultsEffect(
  results: WorkspaceValidationResult,
  outputDir?: string,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    const outputPath = outputDir || results.summary.totalDatasets > 0
      ? './validation_results'
      : './validation_results';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `validation-results-${timestamp}.json`;
    const fullPath = join(outputPath, filename);

    // Create output directory
    yield* _(
      Effect.tryPromise({
        try: () => Deno.mkdir(outputPath, { recursive: true }),
        catch: (error) =>
          new OutputError({
            message: `Failed to create output directory: ${error}`,
            outputPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    // Write results file
    yield* _(
      Effect.tryPromise({
        try: () => Deno.writeTextFile(fullPath, JSON.stringify(results, null, 2)),
        catch: (error) =>
          new OutputError({
            message: `Failed to write results file: ${error}`,
            outputPath: fullPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    Output.success(`✅ Results written to: ${fullPath}`);
    Output.blank();
    Output.line(`Overall status: ${results.overallStatus}`);
    Output.line(
      `Datasets: ${results.summary.datasetsPassedCount} passed, ${results.summary.datasetsWithWarningsCount} warnings, ${results.summary.datasetsFailedCount} failed`,
    );
  });
}

// Handle validation results and exit codes
function handleValidationResults(
  results: WorkspaceValidationResult,
): Effect.Effect<void, CLIError> {
  return Effect.gen(function* (_) {
    switch (results.overallStatus) {
      case 'fail':
        yield* _(Effect.fail(
          new CLIError({
            message: 'Validation failed',
            hint: 'Fix the errors above before proceeding.',
            exitCode: 1,
          }),
        ));
        break;
      case 'warn':
        yield* _(Effect.fail(
          new CLIError({
            message: 'Validation passed with warnings',
            hint: 'Consider reviewing the warnings above.',
            exitCode: 2,
          }),
        ));
        break;
      case 'pass':
        // Success - no error to yield
        break;
      default:
        yield* _(Effect.fail(
          new CLIError({
            message: 'Unknown validation status',
            exitCode: 3,
          }),
        ));
    }
  });
}

/**
 * Exhaustive error handler for validate command errors.
 * Uses Match.exhaustive to ensure all error types are handled.
 * TypeScript will error if a new error type is added but not handled here.
 */
function handleValidateError(
  error: Effect.Effect.Error<ReturnType<typeof buildValidationEffect>>,
): never {
  Output.blank();

  const exitCode = Match.value(error).pipe(
    // CLI-specific errors (validation status)
    Match.tag('CLIError', (e) => {
      if (e.exitCode === 1) {
        Output.error('❌ Overall status: FAILED');
      } else if (e.exitCode === 2) {
        Output.warning('⚠️  Overall status: PASSED with warnings');
      }
      if (e.hint) {
        Output.muted(`   ${e.hint}`);
      }
      return e.exitCode;
    }),
    // Output/file writing errors
    Match.tag('OutputError', (e) => {
      Output.error('❌ Output failed:');
      Output.error(e.message);
      Output.muted(`Path: ${e.outputPath}`);
      return 3;
    }),
    // Validation logic errors
    Match.tag('ValidationError', (e) => {
      Output.error('❌ Validation error:');
      Output.error(e.message);
      return 1;
    }),
    // Workspace configuration errors
    Match.tag('ConfigNotFoundError', (e) => {
      Output.error('❌ Configuration not found:');
      Output.error(e.message);
      Output.blank();
      Output.muted(`Searched from: ${e.startDirectory}`);
      Output.muted(`Paths checked:\n${e.searchDescription}`);
      Output.blank();
      Output.warning('💡 Hint: Create a darwinkit.json configuration file.');
      return 3;
    }),
    Match.tag('ConfigParseError', (e) => {
      Output.error('❌ Configuration parse error:');
      Output.error(e.message);
      Output.muted(`File: ${e.configPath}`);
      Output.muted(`Format: ${e.format.toUpperCase()}`);
      return 3;
    }),
    Match.tag('ConfigValidationError', (e) => {
      Output.error('❌ Configuration validation failed:');
      Output.error(e.message);
      Output.muted(`File: ${e.configPath}`);
      if (e.validationErrors.length > 0) {
        Output.blank();
        Output.error('Validation errors:');
        Output.error(e.errorList);
      }
      return 3;
    }),
    Match.tag('DatasetFileNotFoundError', (e) => {
      Output.error('❌ Dataset file not found:');
      Output.error(e.message);
      Output.muted(`Dataset: ${e.datasetName}`);
      Output.muted(`Path: ${e.filePath}`);
      Output.muted(`Config: ${e.configPath}`);
      return 3;
    }),
    Match.tag('TransformInputNotFoundError', (e) => {
      Output.error('❌ Transform input not found:');
      Output.error(e.message);
      Output.muted(`Input: ${e.inputName}`);
      Output.muted(`Path: ${e.filePath}`);
      Output.muted(`Config: ${e.configPath}`);
      return 3;
    }),
    Match.tag('ValidationConfigMissingError', (e) => {
      Output.error('❌ Validation configuration missing:');
      Output.error(e.message);
      Output.muted(`Workspace: ${e.workspaceName}`);
      Output.blank();
      Output.warning('💡 Hint: Add a "validation" section to darwinkit.json.');
      return 3;
    }),
    // Ensure all possible errors are handled
    Match.exhaustive,
  );

  Deno.exit(exitCode);
}

/**
 * Builds a validation pipeline.
 * Separated to allow extracting the error type via Effect.Error<T>.
 */
function buildValidationEffect(
  configPath: string | undefined,
  format: 'table' | 'json',
  outputDir: string | undefined,
  spinner: ProgressSpinner,
) {
  return Effect.gen(function* (_) {
    spinner.update('Loading workspace configuration...');

    // Open workspace (handles discovery, config loading, path validation, and DuckDB connection)
    const workspace = yield* _(Workspace.open(configPath));

    spinner.update('Validating datasets...');

    // Run validation using the workspace's managed connection
    const results = yield* _(workspace.validate());

    // Stop spinner before output
    spinner.stop();

    // Output results with structured error handling
    yield* _(outputResults(results, format, outputDir));

    // Handle exit codes based on results
    yield* _(handleValidationResults(results));
  });
}

// Main validate function
export async function validate(options: {
  config?: string;
  files?: string;
  watch?: boolean;
  format?: string;
  outputDir?: string;
  failFast?: boolean;
}) {
  // Ensure format is valid
  const validFormat = (options.format === 'json') ? 'json' : 'table';

  // Create spinner for validation progress
  const spinner = new ProgressSpinner({
    message: 'Discovering configuration...',
  });
  spinner.start();

  const runValidation = Effect.scoped(
    buildValidationEffect(options.config, validFormat, options.outputDir, spinner),
  );

  const result = await Effect.runPromiseExit(runValidation);

  if (Exit.isFailure(result)) {
    // Stop spinner on error
    spinner.stop();

    // Extract the error from the Cause and handle it exhaustively
    const failureOption = Cause.failureOption(result.cause);
    if (failureOption._tag === 'Some') {
      handleValidateError(failureOption.value);
    } else {
      // Defect or interruption - show raw cause
      Output.blank();
      Output.error('❌ Unexpected error occurred');
      Output.line(Cause.pretty(result.cause));
      Deno.exit(3);
    }
  } else {
    // Success case - validation passed without warnings
    Output.success('✅ Overall status: PASSED');
    Deno.exit(0);
  }
}

function outputTableResults(results: WorkspaceValidationResult) {
  Output.blank();
  Output.section('📂', 'Workspace validation completed');
  Output.muted(`Configuration: ${results.configPath}`);
  Output.blank();

  // Create summary table
  const table = new Table()
    .header(['Dataset', 'Spec', 'Status', 'Errors', 'Warnings', 'Info'])
    .border(true);

  for (const dataset of results.datasetResults) {
    const statusIcon = getStatusIcon(dataset.status);
    const statusText = `${statusIcon} ${dataset.status.toUpperCase()}`;

    // NEW: Count violations from partitioned structure
    const errorCount = dataset.typeErrors.length +
      dataset.requiredFieldErrors.length +
      dataset.violations.errors.length;

    const warningCount = dataset.warnings.length +
      dataset.violations.warnings.length;

    const infoCount = dataset.recommendations.length +
      dataset.violations.info.length;

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
    const hasErrors = dataset.typeErrors.length > 0 ||
      dataset.requiredFieldErrors.length > 0 ||
      dataset.violations.errors.length > 0;

    const hasWarnings = dataset.warnings.length > 0 ||
      dataset.violations.warnings.length > 0;

    const hasInfo = dataset.recommendations.length > 0 ||
      dataset.violations.info.length > 0;

    if (hasErrors || hasWarnings || hasInfo) {
      Output.blank();
      Output.bold(`📊 ${dataset.datasetName} (${dataset.spec})`);
      Output.blank();
    }

    // ❌ ERRORS (required violations)
    if (hasErrors) {
      Output.error(
        `❌ ERRORS (${
          dataset.violations.errors.length + dataset.typeErrors.length +
          dataset.requiredFieldErrors.length
        }):`,
      );

      // Show type errors
      for (const typeError of dataset.typeErrors) {
        Output.error(
          `  • ${typeError.fieldName} (${typeError.expectedType}): ${typeError.failureCount} conversion failures`,
        );

        const exampleFailures = typeError.sampleFailures.slice(0, 3);
        for (const failure of exampleFailures) {
          Output.muted(
            `    - Row ${failure.rowNumber}: "${failure.originalValue}" → ${failure.errorMessage}`,
          );
        }

        if (typeError.failureCount > 3) {
          Output.muted(
            `    ... and ${typeError.failureCount - 3} more failures`,
          );
        }
      }

      // Show required field errors
      for (const fieldError of dataset.requiredFieldErrors) {
        Output.error(`  • ${fieldError.message}`);
      }

      // NEW: Show partitioned error violations
      const errorsByField = groupViolationsByField(dataset.violations.errors);
      for (const [fieldName, violations] of errorsByField) {
        const firstViolation = violations[0];
        Output.error(
          `  • ${fieldName} (${firstViolation.validatorType}): ${violations.length} violations`,
        );

        // Show first few violations as examples
        const examples = violations.slice(0, 3);
        for (const violation of examples) {
          Output.muted(
            `    - Row ${violation.rowNumber}: ${violation.errorMessage}`,
          );
        }

        if (violations.length > 3) {
          Output.muted(`    ... and ${violations.length - 3} more violations`);
        }
      }

      Output.blank();
    }

    // ⚠️ WARNINGS (recommended violations)
    if (hasWarnings) {
      Output.warning(
        `⚠️  WARNINGS (${dataset.violations.warnings.length + dataset.warnings.length}):`,
      );

      // Show field warnings (missing recommended fields)
      for (const warning of dataset.warnings) {
        Output.warning(`  • ${warning.message}`);
      }

      // NEW: Show partitioned warning violations
      const warningsByField = groupViolationsByField(
        dataset.violations.warnings,
      );
      for (const [fieldName, violations] of warningsByField) {
        const firstViolation = violations[0];
        Output.warning(
          `  • ${fieldName} (${firstViolation.validatorType}): ${violations.length} violations`,
        );

        const examples = violations.slice(0, 3);
        for (const violation of examples) {
          Output.muted(
            `    - Row ${violation.rowNumber}: ${violation.errorMessage}`,
          );
        }

        if (violations.length > 3) {
          Output.muted(`    ... and ${violations.length - 3} more violations`);
        }
      }

      Output.blank();
    }

    // ℹ️ INFO (optional violations)
    if (hasInfo) {
      Output.info(
        `ℹ️  INFO (${dataset.violations.info.length + dataset.recommendations.length}):`,
      );

      // Show recommendations (missing optional fields)
      for (const recommendation of dataset.recommendations) {
        Output.info(`  • ${recommendation.message}`);
      }

      // NEW: Show partitioned info violations
      const infoByField = groupViolationsByField(dataset.violations.info);
      for (const [fieldName, violations] of infoByField) {
        const firstViolation = violations[0];
        Output.info(
          `  • ${fieldName} (${firstViolation.validatorType}): ${violations.length} violations`,
        );

        const examples = violations.slice(0, 3);
        for (const violation of examples) {
          Output.muted(
            `    - Row ${violation.rowNumber}: ${violation.errorMessage}`,
          );
        }

        if (violations.length > 3) {
          Output.muted(`    ... and ${violations.length - 3} more violations`);
        }
      }

      Output.blank();
    }
  }

  // Helper function to group violations by field
  function groupViolationsByField(
    violations: ReadonlyArray<ValidationViolation>,
  ): Map<string, ValidationViolation[]> {
    const grouped = new Map<string, ValidationViolation[]>();

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
    Output.section('🔗', 'Cross-dataset validation');
    Output.blank();

    for (const crossResult of results.crossDatasetResults) {
      if (crossResult.violations.length > 0) {
        Output.error(
          `❌ Foreign key violation: ${crossResult.sourceDataset}.${crossResult.sourceField} → ${crossResult.targetDataset}.${crossResult.targetField}`,
        );

        const sampleViolations = crossResult.violations.slice(0, 5);
        for (const violation of sampleViolations) {
          Output.error(
            `  • Row ${violation.rowNumber}: ${violation.errorMessage}`,
          );
        }

        if (crossResult.violations.length > 5) {
          Output.muted(
            `  ... and ${crossResult.violations.length - 5} more violations`,
          );
        }
        Output.blank();
      } else {
        Output.success(
          `✅ Foreign key valid: ${crossResult.sourceDataset}.${crossResult.sourceField} → ${crossResult.targetDataset}.${crossResult.targetField}`,
        );
      }
    }
    Output.blank();
  }

  // Overall summary
  Output.bold('📊 Summary:');
  Output.line(`  Datasets processed: ${results.summary.totalDatasets}`);
  Output.line(
    `  ${colors.green('Passed')}: ${results.summary.datasetsPassedCount}`,
  );
  Output.line(
    `  ${colors.yellow('Warnings')}: ${results.summary.datasetsWithWarningsCount}`,
  );
  Output.line(
    `  ${colors.red('Failed')}: ${results.summary.datasetsFailedCount}`,
  );
  Output.blank();
  Output.line(`  ${colors.red('❌ Errors')}: ${results.summary.totalErrors}`);
  Output.line(
    `  ${colors.yellow('⚠️  Warnings')}: ${results.summary.totalWarnings}`,
  );
  Output.line(`  ${colors.blue('ℹ️  Info')}: ${results.summary.totalInfo}`);
  Output.blank();
  Output.line(`  Total rows processed: ${results.summary.totalRowsProcessed}`);
  Output.line(`  Processing time: ${results.totalProcessingTimeMs}ms`);
  Output.blank();
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
      return '❌';
    default:
      return '❓';
  }
}

export const validateCommand = new Command()
  .description(
    'Validate datasets in workspace using darwinkit.json configuration',
  )
  .option(
    '--config <path:string>',
    'Path to configuration directory (defaults to current directory)',
  )
  .option(
    '--files <files:string>',
    'Comma-separated list of specific files to validate (validates all by default)',
  )
  .option(
    '--watch',
    'Watch files for changes and validate continuously',
    { default: false },
  )
  .option(
    '--format <format:string>',
    'Output format: table or json',
    { default: 'table' },
  )
  .option(
    '--output-dir <path:string>',
    'Directory for output files (used with --format json)',
    { default: './validation_results' },
  )
  .option(
    '--fail-fast',
    'Stop validation on first dataset with errors (only validates required violations)',
    { default: false },
  )
  .action(validate);
