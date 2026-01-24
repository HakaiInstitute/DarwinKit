/**
 * Example refactoring of transform.ts using the new withSpinner utility
 *
 * This demonstrates how the manual spinner management can be replaced
 * with automatic lifecycle management using Effect's resource system.
 */

import { Command } from '@cliffy/command';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Match from 'effect/Match';

import { Workspace } from '@dwkt/core';
import { hasTransform } from '@dwkt/domain';
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
  if (hasTransform(config)) {
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

async function transform(options: {
  config?: string;
  skipImport?: boolean;
  skipPostImport?: boolean;
  skipExport?: boolean;
}) {
  // Track timing for summary
  const startTime = Date.now();

  // Transformation pipeline using Effect with automatic spinner management
  const program = Effect.gen(function* (_) {
    // Discover workspace with spinner
    const workspace = yield* _(
      withSpinner(
        { message: 'Discovering configuration...' },
        () => Workspace.discover(options.config),
      ),
    );

    // Display workspace info (spinner stopped automatically)
    displayWorkspaceInfo(workspace);

    const datasets = workspace.getDatasets();

    // Run transformation with spinner that updates during execution
    yield* _(
      withSpinner(
        { message: 'Starting transformation...' },
        (spinner) =>
          Effect.gen(function* (_) {
            // Update spinner message based on what's being done
            if (!options.skipImport) {
              yield* _(
                spinner.update(
                  `Importing CSV files from ${datasets.length} dataset(s)...`,
                ),
              );
            } else if (!options.skipExport) {
              yield* _(spinner.update('Exporting transformed data...'));
            } else {
              yield* _(spinner.update('Running transformation pipeline...'));
            }

            // Execute transformation with options
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

    // Spinner stopped automatically - display summary
    displayTransformationSummary(workspace, startTime);

    workspace.close();
  });

  // Run the Effect pipeline
  const result = await Effect.runPromiseExit(program);

  // Handle result at the boundary - display errors and convert to exit codes
  if (Exit.isSuccess(result)) {
    Output.success('✅ Transformation complete');
    Deno.exit(0);
  } else {
    // Extract first failure from cause
    const failures = Array.from(Cause.failures(result.cause));
    if (failures.length > 0) {
      const error = failures[0];
      if (typeof error === 'object' && error !== null && '_tag' in error) {
        // Display error message and get exit code based on error type
        const exitCode = Match.value(error as { _tag: string }).pipe(
          Match.tag('ConfigNotFoundError', (err) => {
            Output.error('Configuration Error:');
            Output.error((err as { message: string }).message);
            Output.blank();
            Output.warning('💡 Hint: Create a darwinkit.json configuration file.');
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
              '💡 Hint: Add the required configuration section to your darwinkit.json file.',
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
        Deno.exit(exitCode);
      }
    }
    // Fallback for non-tagged errors
    Output.error('Unexpected error:');
    Output.error(Cause.pretty(result.cause));
    Deno.exit(3);
  }
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
