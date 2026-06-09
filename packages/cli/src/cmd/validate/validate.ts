import { colors } from '@cliffy/ansi/colors';
import { Command } from '@cliffy/command';
import { Table } from '@cliffy/table';
import { Workspace } from '@dwkt/core/workspace';
import type {
  FieldViolation,
  SchemaViolation,
  WorkspaceValidationResult,
} from '@dwkt/domain/types';
import { join } from '@std/path';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Match from 'effect/Match';
import { CLIError, OutputError } from '../../errors.ts';
import { Diagnostic, Output, type OutputSink } from '../../utils/output.ts';
import { ProgressSpinner } from '../../utils/spinner.ts';
import { groupViolationsByField, renderValidationMarkdown } from './markdown-renderer.ts';

/**
 * Render one severity section (errors/warnings/info) of the table output.
 * Terminal counterpart to markdown-renderer's renderViolationSection.
 */
function renderTableViolationSection(
  label: string,
  write: (msg: string) => void,
  schemaViolations: ReadonlyArray<SchemaViolation>,
  fieldViolations: ReadonlyArray<FieldViolation>,
): void {
  const total = schemaViolations.length + fieldViolations.length;
  if (total === 0) return;

  write(`${label.toUpperCase()} (${total}):`);

  if (schemaViolations.length > 0) {
    write('  Schema Issues:');
    for (const violation of schemaViolations) {
      write(`    • ${violation.fieldName}: ${violation.errorMessage}`);
    }
  }

  if (fieldViolations.length > 0) {
    write(`  Data Validation ${label}:`);
    for (const [fieldName, violations] of groupViolationsByField(fieldViolations)) {
      const firstViolation = violations[0];
      write(`    • ${fieldName} (${firstViolation._tag}): ${violations.length} violations`);
      for (const violation of violations.slice(0, 3)) {
        Output.muted(`      - Row ${violation.rowNumber}: ${violation.errorMessage}`);
      }
      if (violations.length > 3) {
        Output.muted(`      ... and ${violations.length - 3} more violations`);
      }
    }
  }

  Output.blank();
}

/** Emit the results as pretty JSON to stdout. */
function emitJsonToStdout(results: WorkspaceValidationResult): void {
  console.log(JSON.stringify(results, null, 2));
}

/** Emit the results as rendered Markdown to stdout. */
function emitMarkdownToStdout(results: WorkspaceValidationResult): void {
  console.log(renderValidationMarkdown(results));
}

/** Write the status/summary footer through the given output sink. */
function printSummary(out: OutputSink, results: WorkspaceValidationResult): void {
  out.line(`Overall status: ${results.overallStatus}`);
  const warningNote = results.summary.datasetsWithWarningsCount > 0
    ? ` (${results.summary.datasetsWithWarningsCount} with warnings)`
    : '';
  out.line(
    `Datasets: ${results.summary.datasetsPassedCount} passed${warningNote}, ${results.summary.datasetsFailedCount} failed`,
  );
}

function outputResults(
  results: WorkspaceValidationResult,
  format: 'table' | 'json' | 'markdown' | 'markdown_summary_action',
  outputDir: string | undefined,
  emitToStdout: boolean,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* () {
    if (emitToStdout && format === 'json') {
      emitJsonToStdout(results);
      printSummary(Diagnostic, results);
    } else if (emitToStdout && format === 'markdown') {
      emitMarkdownToStdout(results);
      printSummary(Diagnostic, results);
    } else if (format === 'json') {
      yield* outputJsonResultsEffect(results, outputDir);
    } else if (format === 'markdown') {
      yield* outputMarkdownResultsEffect(results, outputDir, false);
    } else if (format === 'markdown_summary_action') {
      yield* outputMarkdownResultsEffect(results, outputDir, true);
    } else {
      outputTableResults(results);
    }
  });
}

/** Shared: write a results file (mkdir + write) and print the summary footer. */
function writeResultsFile(
  results: WorkspaceValidationResult,
  outputDir: string | undefined,
  filename: string,
  content: string,
  label: string,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* () {
    const outputPath = outputDir ?? './validation_results';
    const fullPath = join(outputPath, filename);

    yield* Effect.tryPromise({
      try: () => Deno.mkdir(outputPath, { recursive: true }),
      catch: (error) =>
        new OutputError({
          message: `Failed to create output directory: ${error}`,
          outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    yield* Effect.tryPromise({
      try: () => Deno.writeTextFile(fullPath, content),
      catch: (error) =>
        new OutputError({
          message: `Failed to write results file: ${error}`,
          outputPath: fullPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    Output.success(`${label} written to: ${fullPath}`);
    Output.blank();
    printSummary(Output, results);
  });
}

function outputJsonResultsEffect(
  results: WorkspaceValidationResult,
  outputDir?: string,
): Effect.Effect<void, OutputError> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return writeResultsFile(
    results,
    outputDir,
    `validation-results-${timestamp}.json`,
    JSON.stringify(results, null, 2),
    'Results',
  );
}

function outputMarkdownResultsEffect(
  results: WorkspaceValidationResult,
  outputDir?: string,
  github_action?: boolean,
): Effect.Effect<void, OutputError> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = github_action ? 'validation-results.md' : `validation-results-${timestamp}.md`;
  return writeResultsFile(
    results,
    outputDir,
    filename,
    renderValidationMarkdown(results),
    'Markdown results',
  );
}

function handleValidationResults(
  results: WorkspaceValidationResult,
): Effect.Effect<void, CLIError> {
  return Effect.gen(function* () {
    switch (results.overallStatus) {
      case 'fail':
        yield* Effect.fail(
          new CLIError({
            message: 'Validation failed',
            hint: 'Fix the errors above before proceeding.',
            exitCode: 1,
          }),
        );
        break;
      case 'warn':
        yield* Effect.fail(
          new CLIError({
            message: 'Validation passed with warnings',
            hint: 'Consider reviewing the warnings above.',
            exitCode: 2,
          }),
        );
        break;
      case 'pass':
        break;
      default:
        yield* Effect.fail(
          new CLIError({
            message: 'Unknown validation status',
            exitCode: 3,
          }),
        );
    }
  });
}

function handleValidateError(
  error: Effect.Error<ReturnType<typeof buildValidationEffect>>,
  options?: { strict?: boolean; emitToStdout?: boolean },
): never {
  const out = options?.emitToStdout ? Diagnostic : Output;
  out.blank();

  const exitCode = Match.value(error).pipe(
    Match.tag('CLIError', (e) => {
      if (e.exitCode === 1) {
        out.error('Overall status: FAILED');
      } else if (e.exitCode === 2) {
        out.warning('Overall status: PASSED with warnings');
      }
      if (e.hint) {
        out.muted(`   ${e.hint}`);
      }
      return options?.strict ? e.exitCode : (e.exitCode === 2 ? 0 : e.exitCode);
    }),
    Match.tag('OutputError', (e) => {
      out.error('Output failed:');
      out.error(e.message);
      out.muted(`Path: ${e.outputPath}`);
      return 3;
    }),
    Match.tag('ValidationError', (e) => {
      out.error('Validation error:');
      out.error(e.message);
      return 1;
    }),
    Match.tag('ConfigNotFoundError', (e) => {
      out.error('Configuration not found:');
      out.error(e.message);
      out.blank();

      if (e.searchedPaths.length > 1) {
        out.muted(`Searched from: ${e.startDirectory}`);
        out.muted(`Paths checked:\n${e.searchDescription}`);
        out.blank();
        out.warning('Hint: Create a darwinkit.yaml configuration file.');
      } else {
        out.muted(`Path: ${e.searchedPaths[0]}`);
        out.blank();
        out.warning('Hint: Check that the file path is correct.');
      }
      return 3;
    }),
    Match.tag('ConfigParseError', (e) => {
      out.error('Configuration parse error:');
      out.error(e.message);
      out.muted(`File: ${e.configPath}`);
      return 3;
    }),
    Match.tag('ConfigValidationError', (e) => {
      out.error('Configuration validation failed:');
      out.error(e.message);
      out.muted(`File: ${e.configPath}`);
      if (e.validationErrors.length > 0) {
        out.blank();
        out.error('Validation errors:');
        out.error(e.errorList);
      }
      return 3;
    }),
    Match.tag('DatasetFileNotFoundError', (e) => {
      out.error('Dataset file not found:');
      out.error(e.message);
      out.muted(`Dataset: ${e.datasetName}`);
      out.muted(`Path: ${e.filePath}`);
      out.muted(`Config: ${e.configPath}`);
      return 3;
    }),
    Match.tag('TransformInputNotFoundError', (e) => {
      out.error('Transform input not found:');
      out.error(e.message);
      out.muted(`Input: ${e.inputName}`);
      out.muted(`Path: ${e.filePath}`);
      out.muted(`Config: ${e.configPath}`);
      return 3;
    }),
    Match.tag('ValidationConfigMissingError', (e) => {
      out.error('Validation configuration missing:');
      out.error(e.message);
      out.muted(`Workspace: ${e.workspaceName}`);
      out.blank();
      out.warning('Hint: Add a "validation" section to darwinkit.yaml.');
      return 3;
    }),
    Match.tag('NoDatasetsDefinedError', (e) => {
      out.error('No datasets defined:');
      out.error(e.message);
      out.blank();
      out.warning('Hint: Add datasets to the "validation.datasets" array in darwinkit.yaml.');
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
  emitToStdout: boolean,
  failFast?: boolean,
) {
  const reportProgress = (message: string): void => {
    if (emitToStdout) {
      Diagnostic.muted(message);
    } else {
      spinner.update(message);
    }
  };
  return Effect.gen(function* () {
    reportProgress('Loading workspace configuration...');

    const workspace = yield* Workspace.open(configPath);

    reportProgress('Validating datasets...');

    const results = yield* workspace.validate({ failFast });

    spinner.stop();

    yield* outputResults(results, format, outputDir, emitToStdout);
    yield* handleValidationResults(results);
  });
}

async function validate(options: {
  config?: string;
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

  const emitToStdout = (validFormat === 'json' || validFormat === 'markdown') &&
    options.outputDir === undefined;
  const out = emitToStdout ? Diagnostic : Output;

  const spinner = new ProgressSpinner({
    message: 'Discovering configuration...',
  });
  if (!emitToStdout) {
    spinner.start();
  }

  const runValidation = Effect.scoped(
    buildValidationEffect(
      options.config,
      validFormat,
      options.outputDir,
      spinner,
      emitToStdout,
      options.failFast,
    ),
  );

  const result = await Effect.runPromiseExit(runValidation);

  if (Exit.isFailure(result)) {
    spinner.stop();

    const failureOption = Cause.findErrorOption(result.cause);
    if (failureOption._tag === 'Some') {
      handleValidateError(failureOption.value, {
        strict: options.strict,
        emitToStdout,
      });
    } else {
      out.blank();
      out.error('Unexpected error occurred');
      out.line(Cause.pretty(result.cause));
      Deno.exit(3);
    }
  } else {
    out.success('Overall status: PASSED');
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

    renderTableViolationSection(
      'Errors',
      (m) => Output.error(m),
      dataset.schemaViolations.errors,
      dataset.fieldViolations.errors,
    );

    renderTableViolationSection(
      'Warnings',
      (m) => Output.warning(m),
      dataset.schemaViolations.warnings,
      dataset.fieldViolations.warnings,
    );

    renderTableViolationSection(
      'Info',
      (m) => Output.info(m),
      dataset.schemaViolations.info,
      dataset.fieldViolations.info,
    );
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
    '--format <format:string>',
    'Output format: table (default), json, or markdown',
    { default: 'table' },
  )
  .option(
    '--output-dir <path:string>',
    'Write JSON/Markdown results to a file in this directory instead of stdout',
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
