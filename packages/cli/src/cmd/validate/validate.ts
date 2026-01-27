import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { Table } from '@cliffy/table';
import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  prettyPrintConfigError,
  WorkspaceValidator,
} from '@dwkt/core';
import type { ValidationViolation, WorkspaceValidationResult } from '@dwkt/domain';
import { join } from '@std/path';
import * as Cause from 'effect/Cause';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Match from 'effect/Match';
import { Output } from '../../utils/output.ts';
import { ProgressSpinner } from '../../utils/spinner.ts';

// CLI-specific errors with structured types
// Using Data.TaggedError for proper Error extension and stack traces
export class CLIError extends Data.TaggedError('CLIError')<{
  readonly message: string;
  readonly hint?: string;
  readonly exitCode: number;
}> {}

export class OutputError extends Data.TaggedError('OutputError')<{
  readonly message: string;
  readonly outputPath: string;
  readonly cause?: Error;
}> {}

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

// Error handler using Effect.Match for exhaustive pattern matching
function handleCLIError(error: unknown): never {
  // Check if error has _tag property for pattern matching
  if (typeof error === 'object' && error !== null && '_tag' in error) {
    const exitCode = Match.value(error).pipe(
      Match.tag('CLIError', (cliError: CLIError) => {
        if (cliError.exitCode === 1) {
          Output.error('❌ Overall status: FAILED');
        } else if (cliError.exitCode === 2) {
          Output.warning('⚠️  Overall status: PASSED with warnings');
        }

        if (cliError.hint) {
          Output.muted(`   ${cliError.hint}`);
        }
        return cliError.exitCode;
      }),
      Match.tag('ConfigNotFoundError', (configError: { message: string }) => {
        Output.error('❌ Validation failed:');
        Output.error(configError.message);
        Output.blank();
        Output.warning(
          '💡 Hint: Create a darwinkit.json configuration file in your repository root.',
        );
        Output.warning('   See documentation for configuration format.');
        return 3;
      }),
      Match.tag(
        'ConfigValidationError',
        (configError: { message: string; validationErrors?: string[] }) => {
          Output.error('❌ Configuration validation failed:');
          Output.error(configError.message);
          if (configError.validationErrors) {
            Output.error('Validation errors:');
            for (const validationError of configError.validationErrors) {
              Output.error(`  • ${validationError}`);
            }
          }
          return 3;
        },
      ),
      Match.tag(
        'OutputError',
        (outputError: { message: string; outputPath?: string }) => {
          Output.error('❌ Output failed:');
          Output.error(outputError.message);
          if (outputError.outputPath) {
            Output.muted(`Path: ${outputError.outputPath}`);
          }
          return 3;
        },
      ),
      Match.tag(
        'WorkspaceValidationError',
        (validationError: { message: string }) => {
          Output.error('❌ Validation failed:');
          Output.error(validationError.message);
          return 1;
        },
      ),
      // Fallback for other tagged errors
      Match.orElse(() => {
        Output.error('❌ Unexpected error:');
        Output.error(String(error));
        return 3;
      }),
    );

    Deno.exit(exitCode);
  } else {
    // Fallback for non-tagged errors
    Output.error('❌ Validation failed:');
    Output.error(String(error));
    Deno.exit(3);
  }
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

  // Validation pipeline using Effect
  const runValidation = Effect.gen(function* (_) {
    // Initialize validation service
    const validator = new WorkspaceValidator();

    spinner.update('Validating datasets...');

    // Run validation - this returns Effect<WorkspaceValidationResult, WorkspaceValidationError>
    const results = yield* _(
      validator.validateFromConfig(options.config, {
        failFast: options.failFast,
      }),
    );

    // Stop spinner before output
    spinner.stop();

    // Output results with structured error handling
    yield* _(outputResults(results, validFormat, options.outputDir));

    // Handle exit codes based on results
    yield* _(handleValidationResults(results));
  });

  // Run the Effect pipeline with Exit to preserve Cause information
  const result = await Effect.runPromiseExit(runValidation);
  //const result = await Effect.runPromise(runValidation).catch(console.error);

  if (Exit.isFailure(result)) {
    // Stop spinner on error
    spinner.stop();

    // Error case - use Cause-aware error handling
    handleCLIErrorWithCause(result.cause);
  } else {
    // Success case - validation passed without warnings
    Output.success('✅ Overall status: PASSED');
    Deno.exit(0);
  }
}

/**
 * Handle CLI errors using Effect's Cause for better error messages
 */
function handleCLIErrorWithCause(
  cause: Cause.Cause<unknown>,
): never {
  Output.blank();

  // First, try using our custom pretty printer for config errors
  try {
    const prettyMessage = prettyPrintConfigError(
      cause as Cause.Cause<
        | ConfigNotFoundError
        | ConfigParseError
        | ConfigValidationError
        | DatasetFileNotFoundError
      >,
    );
    Output.error('❌ Configuration Error:\n');
    Output.line(prettyMessage);
    Output.blank();
    Deno.exit(1);
  } catch {
    // Fallback to original error handler
    const failures = Cause.failures(cause);
    if (failures.length > 0) {
      const error = Array.from(failures)[0];
      handleCLIError(error);
    } else {
      Output.error('❌ Unexpected error occurred');
      Output.line(Cause.pretty(cause));
      Deno.exit(3);
    }
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
