import { Command } from '@cliffy/command';
import * as Effect from 'effect/Effect';
import * as Match from 'effect/Match';

import { Workspace } from '@dwkt/core';
import { Output } from '../../utils/output.ts';
import { withSpinner } from '../../utils/spinner.ts';
import { displayWorkspaceInfo } from '../../utils/workspace-display.ts';

/**
 * Display transformation summary after completion
 */
function displayTransformationSummary(workspace: Workspace, startTime: number) {
  const config = workspace.getConfig();
  const endTime = Date.now();
  const duration = endTime - startTime;

  Output.blank();
  Output.section('Transformation Summary');

  const datasets = workspace.getDatasets();
  Output.line(`  Datasets transformed: ${datasets.length}`);

  // Check if transform config exists and has output settings
  if ('transform' in config && config.transform?.output) {
    const outputDir = config.transform.output.dir;
    Output.line(`  Output directory: ${outputDir}`);

    Output.blank();
    Output.muted('  CSV files exported:');
    for (const dataset of datasets) {
      Output.muted(`    • ${dataset.name}.csv`);
    }

    if (config.transform.output.exportDB) {
      const dbFileName = config.transform.output.exportDbFileName || 'darwinkit';
      Output.blank();
      Output.line(`  Database exported: ${outputDir}/${dbFileName}.duckdb`);
    }
  }

  Output.blank();
  Output.line(`  Processing time: ${duration}ms`);
  Output.blank();
}

/**
 * Handle errors by displaying appropriate messages and returning an exit code.
 * Wrapped in Effect.sync since Output calls are side effects.
 */
function handleError(error: unknown): Effect.Effect<number> {
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
        Output.warning(
          'Hint: Add the required configuration section to your darwinkit.json file.',
        );
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
      Match.tag('TransformationError', (err) => {
        Output.error('Transformation failed:');
        Output.error((err as { message: string }).message);
        return 1;
      }),
      Match.tag('OutputError', (err) => {
        const e = err as { message: string; outputPath?: string };
        Output.error('Output operation failed:');
        Output.error(e.message);
        if (e.outputPath) {
          Output.muted(`Path: ${e.outputPath}`);
        }
        return 1;
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

async function transform(options: {
  config?: string;
  skipImport?: boolean;
  skipPostImport?: boolean;
  skipExport?: boolean;
}) {
  const startTime = Date.now();

  // Transformation pipeline with error handling composed into the Effect
  const program = Effect.gen(function* (_) {
    const workspace = yield* _(
      withSpinner(
        { message: 'Discovering configuration...' },
        () => Workspace.discover(options.config),
      ),
    );

    displayWorkspaceInfo(workspace);

    const datasets = workspace.getDatasets();

    yield* _(
      withSpinner(
        { message: 'Starting transformation' },
        (spinner) =>
          Effect.gen(function* (_) {
            if (!options.skipImport) {
              spinner.update(
                `Importing CSV files from ${datasets.length} dataset(s)...`,
              );
            } else if (!options.skipExport) {
              spinner.update('Exporting transformed data...');
            } else {
              spinner.update('Running transformation pipeline...');
            }

            yield* _(
              workspace.transformer.run({
                skipImport: options.skipImport,
                skipPostImport: options.skipPostImport,
                skipExport: options.skipExport,
              }),
            );
          }),
      ),
    );

    displayTransformationSummary(workspace, startTime);
    workspace.close();

    Output.success('Transformation complete');
    return 0;
  }).pipe(
    Effect.catchAll(handleError),
  );

  const exitCode = await Effect.runPromise(program);
  Deno.exit(exitCode);
}

export const transformCommand = new Command()
  .description(
    'Run a transformation script based on the project configuration.',
  )
  .option(
    '--config <path:string>',
    'Path to configuration directory (defaults to current directory)',
  )
  .option(
    '--skip-import',
    'Skip CSV import (data already loaded)',
    { default: false },
  )
  .option(
    '--skip-post-import',
    'Skip post-import transformations',
    { default: false },
  )
  .option(
    '--skip-export',
    'Skip export operations',
    { default: false },
  )
  .action(transform);
