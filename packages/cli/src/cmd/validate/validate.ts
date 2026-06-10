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
import { Output, Payload } from '../../utils/output.ts';
import { ProgressSpinner } from '../../utils/spinner.ts';
import { groupViolationsByField, renderValidationMarkdown } from './markdown-renderer.ts';

// markdown_summary_action is CI-internal (GitHub Action) and intentionally
// omitted from user-facing format lists (--format help, unknown-format warning).
const VALIDATE_FORMATS = ['table', 'json', 'markdown', 'markdown_summary_action'] as const;
type ValidateFormat = typeof VALIDATE_FORMATS[number];

function isValidateFormat(value: string): value is ValidateFormat {
  return (VALIDATE_FORMATS as readonly string[]).includes(value);
}

/** Render the machine-readable payload for a non-table format. */
function renderPayload(
  format: Exclude<ValidateFormat, 'table'>,
  results: WorkspaceValidationResult,
): string {
  return Match.value(format).pipe(
    Match.when('json', () => JSON.stringify(results, null, 2)),
    Match.whenOr('markdown', 'markdown_summary_action', () => renderValidationMarkdown(results)),
    Match.exhaustive,
  );
}

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
        Payload.muted(`      - Row ${violation.rowNumber}: ${violation.errorMessage}`);
      }
      if (violations.length > 3) {
        Payload.muted(`      ... and ${violations.length - 3} more violations`);
      }
    }
  }

  Payload.blank();
}

/** Write the status/summary footer to stderr. */
function printSummary(results: WorkspaceValidationResult): void {
  const status = results.overallStatus;
  const writeStatus = Match.value(status).pipe(
    Match.when('fail', () => Output.error),
    Match.when('warn', () => Output.warning),
    Match.when('pass', () => Output.success),
    Match.exhaustive,
  );
  writeStatus(`Overall status: ${status}`);
  const warningNote = results.summary.datasetsWithWarningsCount > 0
    ? ` (${results.summary.datasetsWithWarningsCount} with warnings)`
    : '';
  Output.line(
    `Datasets: ${results.summary.datasetsPassedCount} passed${warningNote}, ${results.summary.datasetsFailedCount} failed`,
  );
}

function outputResults(
  results: WorkspaceValidationResult,
  format: ValidateFormat,
  outputDir: string | undefined,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* () {
    if (format === 'table') {
      outputTableResults(results);
    } else {
      const payload = renderPayload(format, results);

      if (format === 'markdown_summary_action') {
        // GitHub Action consumer: fixed filename, defaults to ./validation_results.
        yield* writeResultsFile(outputDir, 'validation-results.md', payload, 'Markdown results');
      } else if (outputDir !== undefined) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = format === 'json' ? 'json' : 'md';
        const label = format === 'json' ? 'Results' : 'Markdown results';

        yield* writeResultsFile(
          outputDir,
          `validation-results-${timestamp}.${extension}`,
          payload,
          label,
        );
      } else {
        Payload.line(payload);
      }
    }

    printSummary(results);
  });
}

/** Shared: write a results file (mkdir + write) and confirm on stderr. */
function writeResultsFile(
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
  });
}

function handleValidationResults(
  results: WorkspaceValidationResult,
): Effect.Effect<void, CLIError> {
  return Match.value(results.overallStatus).pipe(
    Match.when('fail', () =>
      Effect.fail(
        new CLIError({
          message: 'Validation failed',
          hint: 'Fix the errors above before proceeding.',
          exitCode: 1,
        }),
      )),
    Match.when('warn', () =>
      Effect.fail(
        new CLIError({
          message: 'Validation passed with warnings',
          hint: 'Consider reviewing the warnings above.',
          exitCode: 2,
        }),
      )),
    Match.when('pass', () => Effect.void),
    Match.exhaustive,
  );
}

function handleValidateError(
  error: Effect.Error<ReturnType<typeof buildValidationEffect>>,
  options?: { strict?: boolean },
): never {
  Output.blank();

  const exitCode = Match.value(error).pipe(
    Match.tag('CLIError', (e) => {
      if (e.hint) {
        Output.muted(e.hint);
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
  format: ValidateFormat,
  outputDir: string | undefined,
  spinner: ProgressSpinner,
  failFast?: boolean,
) {
  return Effect.gen(function* () {
    spinner.update('Loading workspace configuration...');

    const workspace = yield* Workspace.open(configPath);

    spinner.update('Validating datasets...');

    const results = yield* workspace.validate({ failFast });

    spinner.stop();

    yield* outputResults(results, format, outputDir);
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
  if (options.format && !isValidateFormat(options.format)) {
    Output.warning(
      `Unknown format "${options.format}" — using "table". Valid formats: json, markdown, table`,
    );
  }

  const validFormat: ValidateFormat = options.format && isValidateFormat(options.format)
    ? options.format
    : 'table';

  const spinner = new ProgressSpinner({
    message: 'Discovering configuration...',
  });
  spinner.start();

  const runValidation = Effect.scoped(
    buildValidationEffect(
      options.config,
      validFormat,
      options.outputDir,
      spinner,
      options.failFast,
    ),
  );

  const result = await Effect.runPromiseExit(runValidation);

  if (Exit.isFailure(result)) {
    spinner.stop();

    const failureOption = Cause.findErrorOption(result.cause);
    if (failureOption._tag === 'Some') {
      handleValidateError(failureOption.value, { strict: options.strict });
    } else {
      Output.blank();
      Output.error('Unexpected error occurred');
      Output.line(Cause.pretty(result.cause));
      Deno.exit(3);
    }
  } else {
    Deno.exit(0);
  }
}

function outputTableResults(results: WorkspaceValidationResult) {
  Payload.blank();
  Payload.bold('Workspace validation completed');
  Payload.muted(`Configuration: ${results.configPath}`);
  Payload.blank();

  const table = new Table()
    .header(['Dataset', 'Type', 'Status', 'Errors', 'Warnings', 'Info'])
    .border(true);

  for (const dataset of results.datasetResults) {
    const statusText = dataset.status.toUpperCase();
    const coloredStatus = Match.value(dataset.status).pipe(
      Match.when('fail', () => colors.red(statusText)),
      Match.when('warn', () => colors.yellow(statusText)),
      Match.when('pass', () => colors.green(statusText)),
      Match.exhaustive,
    );

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
  Payload.blank();

  for (const dataset of results.datasetResults) {
    const hasErrors = dataset.schemaViolations.errors.length > 0 ||
      dataset.fieldViolations.errors.length > 0;

    const hasWarnings = dataset.schemaViolations.warnings.length > 0 ||
      dataset.fieldViolations.warnings.length > 0;

    const hasInfo = dataset.schemaViolations.info.length > 0 ||
      dataset.fieldViolations.info.length > 0;

    if (hasErrors || hasWarnings || hasInfo) {
      Payload.blank();
      Payload.bold(`${dataset.datasetName} (${dataset.class})`);
      Payload.blank();
    }

    renderTableViolationSection(
      'Errors',
      (m) => Payload.error(m),
      dataset.schemaViolations.errors,
      dataset.fieldViolations.errors,
    );

    renderTableViolationSection(
      'Warnings',
      (m) => Payload.warning(m),
      dataset.schemaViolations.warnings,
      dataset.fieldViolations.warnings,
    );

    renderTableViolationSection(
      'Info',
      (m) => Payload.info(m),
      dataset.schemaViolations.info,
      dataset.fieldViolations.info,
    );
  }

  Payload.bold('Summary:');
  Payload.line(`  Datasets processed: ${results.summary.totalDatasets}`);
  const passedLabel = results.summary.datasetsWithWarningsCount > 0
    ? `${results.summary.datasetsPassedCount} (${results.summary.datasetsWithWarningsCount} with warnings)`
    : `${results.summary.datasetsPassedCount}`;
  Payload.line(`  ${colors.green('Passed')}: ${passedLabel}`);
  Payload.line(
    `  ${colors.red('Failed')}: ${results.summary.datasetsFailedCount}`,
  );
  Payload.blank();
  Payload.line(`  ${colors.red('Errors')}: ${results.summary.totalErrors}`);
  Payload.line(
    `  ${colors.yellow('Warnings')}: ${results.summary.totalWarnings}`,
  );
  Payload.line(`  ${colors.blue('Info')}: ${results.summary.totalInfo}`);
  Payload.blank();
  Payload.line(`  Total rows processed: ${results.summary.totalRowsProcessed}`);
  Payload.line(`  Processing time: ${results.totalProcessingTimeMs}ms`);
  Payload.blank();
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
