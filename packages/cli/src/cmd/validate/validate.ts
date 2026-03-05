import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { Table } from '@cliffy/table';
import { Workspace } from '@dwkt/core/workspace';
import type { FieldViolation, WorkspaceValidationResult } from '@dwkt/domain/types';
import { join } from '@std/path';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Match from 'effect/Match';
import { CLIError, OutputError } from '../../errors.ts';
import { Output } from '../../utils/output.ts';
import { ProgressSpinner } from '../../utils/spinner.ts';
import { renderValidationMarkdown } from './markdown-renderer.ts';

function outputResults(
  results: WorkspaceValidationResult,
  format: 'table' | 'json' | 'markdown' | 'markdown_summary_action',
  outputDir?: string,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    if (format === 'json') {
      yield* _(outputJsonResultsEffect(results, outputDir));
    } else if (format === 'markdown') {
      yield* _(outputMarkdownResultsEffect(results, outputDir, false));
    } else if (format === 'markdown_summary_action') {
      yield* _(outputMarkdownResultsEffect(results, outputDir, true));
    } else {
      outputTableResults(results);
    }
  });
}

function outputJsonResultsEffect(
  results: WorkspaceValidationResult,
  outputDir?: string,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    const outputPath = outputDir ?? './validation_results';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `validation-results-${timestamp}.json`;
    const fullPath = join(outputPath, filename);

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

    Output.success(`Results written to: ${fullPath}`);
    Output.blank();
    Output.line(`Overall status: ${results.overallStatus}`);
    const warningNote = results.summary.datasetsWithWarningsCount > 0
      ? ` (${results.summary.datasetsWithWarningsCount} with warnings)`
      : '';
    Output.line(
      `Datasets: ${results.summary.datasetsPassedCount} passed${warningNote}, ${results.summary.datasetsFailedCount} failed`,
    );
  });
}

function outputMarkdownResultsEffect(
  results: WorkspaceValidationResult,
  outputDir?: string,
  github_action?: boolean,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    const outputPath = outputDir || './validation_results';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = github_action ? 'validation-results.md' : `validation-results-${timestamp}.md`;
    const fullPath = join(outputPath, filename);

    const markdown = renderValidationMarkdown(results);

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

    yield* _(
      Effect.tryPromise({
        try: () => Deno.writeTextFile(fullPath, markdown),
        catch: (error) =>
          new OutputError({
            message: `Failed to write markdown file: ${error}`,
            outputPath: fullPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    Output.success(`Markdown results written to: ${fullPath}`);
    Output.blank();
    Output.line(`Overall status: ${results.overallStatus}`);
    const warningNote = results.summary.datasetsWithWarningsCount > 0
      ? ` (${results.summary.datasetsWithWarningsCount} with warnings)`
      : '';
    Output.line(
      `Datasets: ${results.summary.datasetsPassedCount} passed${warningNote}, ${results.summary.datasetsFailedCount} failed`,
    );
  });
}

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

function handleValidateError(
  error: Effect.Effect.Error<ReturnType<typeof buildValidationEffect>>,
  options?: { strict?: boolean },
): never {
  Output.blank();

  const exitCode = Match.value(error).pipe(
    Match.tag('CLIError', (e) => {
      if (e.exitCode === 1) {
        Output.error('Overall status: FAILED');
      } else if (e.exitCode === 2) {
        Output.warning('Overall status: PASSED with warnings');
      }
      if (e.hint) {
        Output.muted(`   ${e.hint}`);
      }
      return options?.strict ? e.exitCode : (e.exitCode === 2 ? 0 : e.exitCode);
    }),
    Match.tag('OutputError', (e) => {
      Output.error('Output failed:');
      Output.error(e.message);
      Output.muted(`Path: ${e.outputPath}`);
      return 3;
    }),
    Match.tag('ValidationError', (e) => {
      Output.error('Validation error:');
      Output.error(e.message);
      return 1;
    }),
    Match.tag('ConfigNotFoundError', (e) => {
      Output.error('Configuration not found:');
      Output.error(e.message);
      Output.blank();

      if (e.searchedPaths.length > 1) {
        Output.muted(`Searched from: ${e.startDirectory}`);
        Output.muted(`Paths checked:\n${e.searchDescription}`);
        Output.blank();
        Output.warning('Hint: Create a darwinkit.yaml configuration file.');
      } else {
        Output.muted(`Path: ${e.searchedPaths[0]}`);
        Output.blank();
        Output.warning('Hint: Check that the file path is correct.');
      }
      return 3;
    }),
    Match.tag('ConfigParseError', (e) => {
      Output.error('Configuration parse error:');
      Output.error(e.message);
      Output.muted(`File: ${e.configPath}`);
      return 3;
    }),
    Match.tag('ConfigValidationError', (e) => {
      Output.error('Configuration validation failed:');
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
      Output.error('Dataset file not found:');
      Output.error(e.message);
      Output.muted(`Dataset: ${e.datasetName}`);
      Output.muted(`Path: ${e.filePath}`);
      Output.muted(`Config: ${e.configPath}`);
      return 3;
    }),
    Match.tag('TransformInputNotFoundError', (e) => {
      Output.error('Transform input not found:');
      Output.error(e.message);
      Output.muted(`Input: ${e.inputName}`);
      Output.muted(`Path: ${e.filePath}`);
      Output.muted(`Config: ${e.configPath}`);
      return 3;
    }),
    Match.tag('ValidationConfigMissingError', (e) => {
      Output.error('Validation configuration missing:');
      Output.error(e.message);
      Output.muted(`Workspace: ${e.workspaceName}`);
      Output.blank();
      Output.warning('Hint: Add a "validation" section to darwinkit.yaml.');
      return 3;
    }),
    Match.tag('NoDatasetsDefinedError', (e) => {
      Output.error('No datasets defined:');
      Output.error(e.message);
      Output.blank();
      Output.warning('Hint: Add datasets to the "validation.datasets" array in darwinkit.yaml.');
      return 3;
    }),
    Match.exhaustive,
  );

  Deno.exit(exitCode);
}

function buildValidationEffect(
  configPath: string | undefined,
  format: 'table' | 'json' | 'markdown' | 'markdown_summary_action',
  outputDir: string | undefined,
  spinner: ProgressSpinner,
) {
  return Effect.gen(function* (_) {
    spinner.update('Loading workspace configuration...');

    const workspace = yield* _(Workspace.open(configPath));

    spinner.update('Validating datasets...');

    const results = yield* _(workspace.validate());

    spinner.stop();

    yield* _(outputResults(results, format, outputDir));
    yield* _(handleValidationResults(results));
  });
}

export async function validate(options: {
  config?: string;
  files?: string;
  watch?: boolean;
  format?: string;
  outputDir?: string;
  failFast?: boolean;
  strict?: boolean;
}) {
  if (
    options.format &&
    !['json', 'markdown', 'markdown_summary_action', 'table'].includes(options.format)
  ) {
    console.warn(
      `Unknown format "${options.format}" — using "table". Valid formats: json, markdown, table`,
    );
  }

  const validFormat = (
      options.format === 'json' ||
      options.format === 'markdown' ||
      options.format === 'markdown_summary_action'
    )
    ? options.format
    : 'table';

  const spinner = new ProgressSpinner({
    message: 'Discovering configuration...',
  });
  spinner.start();

  const runValidation = Effect.scoped(
    buildValidationEffect(options.config, validFormat, options.outputDir, spinner),
  );

  const result = await Effect.runPromiseExit(runValidation);

  if (Exit.isFailure(result)) {
    spinner.stop();

    const failureOption = Cause.failureOption(result.cause);
    if (failureOption._tag === 'Some') {
      handleValidateError(failureOption.value, { strict: options.strict });
    } else {
      Output.blank();
      Output.error('Unexpected error occurred');
      Output.line(Cause.pretty(result.cause));
      Deno.exit(3);
    }
  } else {
    Output.success('Overall status: PASSED');
    Deno.exit(0);
  }
}

function outputTableResults(results: WorkspaceValidationResult) {
  Output.blank();
  Output.bold('Workspace validation completed');
  Output.muted(`Configuration: ${results.configPath}`);
  Output.blank();

  const table = new Table()
    .header(['Dataset', 'Type', 'Status', 'Errors', 'Warnings', 'Info'])
    .border(true);

  for (const dataset of results.datasetResults) {
    const statusText = dataset.status.toUpperCase();
    const coloredStatus = dataset.status === 'fail'
      ? colors.red(statusText)
      : dataset.status === 'warn'
      ? colors.yellow(statusText)
      : colors.green(statusText);

    const errorCount = dataset.schemaViolations.errors.length +
      dataset.fieldViolations.errors.length;

    const warningCount = dataset.schemaViolations.warnings.length +
      dataset.fieldViolations.warnings.length;

    const infoCount = dataset.schemaViolations.info.length +
      dataset.fieldViolations.info.length;

    table.push([
      dataset.datasetName,
      dataset.class,
      coloredStatus,
      errorCount > 0 ? colors.red(errorCount.toString()) : errorCount.toString(),
      warningCount > 0 ? colors.yellow(warningCount.toString()) : warningCount.toString(),
      infoCount > 0 ? colors.blue(infoCount.toString()) : infoCount.toString(),
    ]);
  }

  table.render();
  Output.blank();

  for (const dataset of results.datasetResults) {
    const hasErrors = dataset.schemaViolations.errors.length > 0 ||
      dataset.fieldViolations.errors.length > 0;

    const hasWarnings = dataset.schemaViolations.warnings.length > 0 ||
      dataset.fieldViolations.warnings.length > 0;

    const hasInfo = dataset.schemaViolations.info.length > 0 ||
      dataset.fieldViolations.info.length > 0;

    if (hasErrors || hasWarnings || hasInfo) {
      Output.blank();
      Output.bold(`${dataset.datasetName} (${dataset.class})`);
      Output.blank();
    }

    if (hasErrors) {
      const totalErrors = dataset.schemaViolations.errors.length +
        dataset.fieldViolations.errors.length;
      Output.error(`ERRORS (${totalErrors}):`);

      if (dataset.schemaViolations.errors.length > 0) {
        Output.error('  Schema Issues:');
        for (const violation of dataset.schemaViolations.errors) {
          Output.error(`    • ${violation.fieldName}: ${violation.errorMessage}`);
        }
      }

      if (dataset.fieldViolations.errors.length > 0) {
        Output.error('  Data Validation Errors:');
        const errorsByField = groupViolationsByField(dataset.fieldViolations.errors);
        for (const [fieldName, violations] of errorsByField) {
          const firstViolation = violations[0];
          Output.error(
            `    • ${fieldName} (${firstViolation._tag}): ${violations.length} violations`,
          );

          // Show first few violations as examples
          const examples = violations.slice(0, 3);
          for (const violation of examples) {
            Output.muted(
              `      - Row ${violation.rowNumber}: ${violation.errorMessage}`,
            );
          }

          if (violations.length > 3) {
            Output.muted(`      ... and ${violations.length - 3} more violations`);
          }
        }
      }

      Output.blank();
    }

    if (hasWarnings) {
      const totalWarnings = dataset.schemaViolations.warnings.length +
        dataset.fieldViolations.warnings.length;
      Output.warning(`WARNINGS (${totalWarnings}):`);

      if (dataset.schemaViolations.warnings.length > 0) {
        Output.warning('  Schema Issues:');
        for (const violation of dataset.schemaViolations.warnings) {
          Output.warning(`    • ${violation.fieldName}: ${violation.errorMessage}`);
        }
      }

      if (dataset.fieldViolations.warnings.length > 0) {
        Output.warning('  Data Validation Warnings:');
        const warningsByField = groupViolationsByField(dataset.fieldViolations.warnings);
        for (const [fieldName, violations] of warningsByField) {
          const firstViolation = violations[0];
          Output.warning(
            `    • ${fieldName} (${firstViolation._tag}): ${violations.length} violations`,
          );

          const examples = violations.slice(0, 3);
          for (const violation of examples) {
            Output.muted(
              `      - Row ${violation.rowNumber}: ${violation.errorMessage}`,
            );
          }

          if (violations.length > 3) {
            Output.muted(`      ... and ${violations.length - 3} more violations`);
          }
        }
      }

      Output.blank();
    }

    if (hasInfo) {
      const totalInfo = dataset.schemaViolations.info.length +
        dataset.fieldViolations.info.length;
      Output.info(`INFO (${totalInfo}):`);

      // Show schema info first
      if (dataset.schemaViolations.info.length > 0) {
        Output.info('  Schema Issues:');
        for (const violation of dataset.schemaViolations.info) {
          Output.info(`    • ${violation.fieldName}: ${violation.errorMessage}`);
        }
      }

      if (dataset.fieldViolations.info.length > 0) {
        Output.info('  Data Validation Info:');
        const infoByField = groupViolationsByField(dataset.fieldViolations.info);
        for (const [fieldName, violations] of infoByField) {
          const firstViolation = violations[0];
          Output.info(
            `    • ${fieldName} (${firstViolation._tag}): ${violations.length} violations`,
          );

          const examples = violations.slice(0, 3);
          for (const violation of examples) {
            Output.muted(
              `      - Row ${violation.rowNumber}: ${violation.errorMessage}`,
            );
          }

          if (violations.length > 3) {
            Output.muted(`      ... and ${violations.length - 3} more violations`);
          }
        }
      }

      Output.blank();
    }
  }

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

  Output.bold('Summary:');
  Output.line(`  Datasets processed: ${results.summary.totalDatasets}`);
  const passedLabel = results.summary.datasetsWithWarningsCount > 0
    ? `${results.summary.datasetsPassedCount} (${results.summary.datasetsWithWarningsCount} with warnings)`
    : `${results.summary.datasetsPassedCount}`;
  Output.line(`  ${colors.green('Passed')}: ${passedLabel}`);
  Output.line(
    `  ${colors.red('Failed')}: ${results.summary.datasetsFailedCount}`,
  );
  Output.blank();
  Output.line(`  ${colors.red('Errors')}: ${results.summary.totalErrors}`);
  Output.line(
    `  ${colors.yellow('Warnings')}: ${results.summary.totalWarnings}`,
  );
  Output.line(`  ${colors.blue('Info')}: ${results.summary.totalInfo}`);
  Output.blank();
  Output.line(`  Total rows processed: ${results.summary.totalRowsProcessed}`);
  Output.line(`  Processing time: ${results.totalProcessingTimeMs}ms`);
  Output.blank();
}

export const validateCommand = new Command()
  .description(
    'Validate datasets in workspace using darwinkit.yaml configuration',
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
  .option(
    '--strict',
    'Exit with non-zero code when warnings are present (default: warnings exit 0)',
    { default: false },
  )
  .action(validate);
