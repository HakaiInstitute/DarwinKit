import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { Table } from '@cliffy/table';
import { join } from '@std/path';
import * as Cause from 'effect/Cause';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  prettyPrintConfigError,
  Workspace,
} from '@dwkt/core';
import type { FieldViolation, WorkspaceValidationResult } from '@dwkt/domain';
import { ErrorCode } from '@dwkt/domain';
import * as Match from 'effect/Match';
import { Output } from '../../utils/output.ts';
import { ProgressSpinner } from '../../utils/spinner.ts';

// CLI-specific errors with structured types
// Using Data.TaggedError for proper Error extension and stack traces
export class CLIError extends Data.TaggedError('CLIError')<{
  readonly message: string;
  readonly code: ErrorCode;
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
    const outputPath = outputDir ?? './validation_results';
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
            code: ErrorCode.VALIDATION_FAILED,
            hint: 'Fix the errors above before proceeding.',
            exitCode: 1,
          }),
        ));
        break;
      case 'warn':
        yield* _(Effect.fail(
          new CLIError({
            message: 'Validation passed with warnings',
            code: ErrorCode.VALIDATION_FAILED,
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
            code: ErrorCode.UNKNOWN_ERROR,
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
      Match.tag('OutputError', (outputError: { message: string; outputPath?: string }) => {
        Output.error('❌ Output failed:');
        Output.error(outputError.message);
        if (outputError.outputPath) {
          Output.muted(`Path: ${outputError.outputPath}`);
        }
        return 3;
      }),
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

/**
 * Display workspace information before validation
 */
function displayWorkspaceInfo(workspace: Workspace) {
  Output.blank();
  Output.section('📂', 'Workspace Information');
  Output.line(`  Name: ${workspace.getName()}`);
  Output.line(`  Version: ${workspace.getVersion()}`);
  if (workspace.getDescription()) {
    Output.line(`  Description: ${workspace.getDescription()}`);
  }
  Output.line(`  Config: ${workspace.getConfigPath()}`);

  const datasets = workspace.getDatasets();
  Output.line(`  Datasets: ${datasets.length}`);
  for (const dataset of datasets) {
    Output.muted(`    • ${dataset.name} (${dataset.spec})`);
  }
  Output.blank();
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
  const spinner = new ProgressSpinner({ message: 'Discovering configuration...' });
  spinner.start();

  // Validation pipeline using Effect
  const runValidation = Effect.gen(function* (_) {
    const workspace = yield* _(Workspace.discover(options.config));

    spinner.stop();
    displayWorkspaceInfo(workspace);
    spinner.start();
    spinner.update('Validating datasets...');

    // Run validation
    const results = yield* _(
      workspace.validator.run({
        failFast: options.failFast,
      }),
    );

    workspace.close();
    spinner.stop();

    yield* _(outputResults(results, validFormat, options.outputDir));

    yield* _(handleValidationResults(results));
  });

  // Run the Effect pipeline with Exit to preserve Cause information
  const result = await Effect.runPromiseExit(runValidation);

  if (Exit.isFailure(result)) {
    spinner.stop();
    handleCLIErrorWithCause(result.cause);
  } else {
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
    const statusIcon = Output.statusIcon(dataset.status);
    const statusText = `${statusIcon} ${dataset.status.toUpperCase()}`;

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
    const hasSchema = hasSchemaErrors || hasSchemaWarnings || hasSchemaInfo;

    const hasFieldErrors = dataset.fieldViolations.errors.length > 0;
    const hasFieldWarnings = dataset.fieldViolations.warnings.length > 0;
    const hasFieldInfo = dataset.fieldViolations.info.length > 0;
    const hasFields = hasFieldErrors || hasFieldWarnings || hasFieldInfo;

    if (hasSchema || hasFields) {
      Output.blank();
      Output.bold(`📊 ${dataset.datasetName} (${dataset.spec})`);
    }

    // ============================================================================
    // 📋 SCHEMA ISSUES (structural/mapping problems)
    // ============================================================================
    if (hasSchema) {
      Output.blank();
      Output.muted('  📋 Schema Issues:');

      // Schema Errors
      if (hasSchemaErrors) {
        Output.error(`    ❌ ERRORS (${dataset.schemaViolations.errors.length}):`);
        for (const violation of dataset.schemaViolations.errors) {
          Output.error(`      • ${violation.errorMessage}`);
        }
      }

      // Schema Warnings
      if (hasSchemaWarnings) {
        Output.warning(`    ⚠️  WARNINGS (${dataset.schemaViolations.warnings.length}):`);
        for (const violation of dataset.schemaViolations.warnings) {
          Output.warning(`      • ${violation.errorMessage}`);
        }
      }

      // Schema Info
      if (hasSchemaInfo) {
        Output.info(`    ℹ️  INFO (${dataset.schemaViolations.info.length}):`);
        for (const violation of dataset.schemaViolations.info) {
          Output.info(`      • ${violation.errorMessage}`);
        }
      }
    }

    // ============================================================================
    // 📊 DATA VALIDATION (row-level issues)
    // ============================================================================
    if (hasFields) {
      Output.blank();
      Output.muted('  📊 Data Validation:');

      // Field Errors
      if (hasFieldErrors) {
        Output.error(`    ❌ ERRORS (${dataset.fieldViolations.errors.length}):`);
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
        Output.warning(`    ⚠️  WARNINGS (${dataset.fieldViolations.warnings.length}):`);
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
        Output.info(`    ℹ️  INFO (${dataset.fieldViolations.info.length}):`);
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

    if (hasSchema || hasFields) {
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
    Output.section('🔗', 'Cross-dataset validation');
    Output.blank();

    for (const crossResult of results.crossDatasetResults) {
      if (crossResult.violations.length > 0) {
        Output.error(
          `❌ Foreign key violation: ${crossResult.sourceDataset}.${crossResult.sourceField} → ${crossResult.targetDataset}.${crossResult.targetField}`,
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
          `✅ Foreign key valid: ${crossResult.sourceDataset}.${crossResult.sourceField} → ${crossResult.targetDataset}.${crossResult.targetField}`,
        );
      }
    }
    Output.blank();
  }

  Output.bold('📊 Summary:');
  Output.line(`  Datasets processed: ${results.summary.totalDatasets}`);
  Output.line(`  ${colors.green('Passed')}: ${results.summary.datasetsPassedCount}`);
  Output.line(`  ${colors.yellow('Warnings')}: ${results.summary.datasetsWithWarningsCount}`);
  Output.line(`  ${colors.red('Failed')}: ${results.summary.datasetsFailedCount}`);
  Output.blank();
  Output.line(`  ${colors.red('❌ Errors')}: ${results.summary.totalErrors}`);
  Output.line(`  ${colors.yellow('⚠️  Warnings')}: ${results.summary.totalWarnings}`);
  Output.line(`  ${colors.blue('ℹ️  Info')}: ${results.summary.totalInfo}`);
  Output.blank();
  Output.line(`  Total rows processed: ${results.summary.totalRowsProcessed}`);
  Output.line(`  Processing time: ${results.totalProcessingTimeMs}ms`);
  Output.blank();
}

export const validateCommand = new Command()
  .description('Validate datasets in workspace using darwinkit.json configuration')
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
