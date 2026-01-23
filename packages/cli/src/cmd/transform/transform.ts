import { Command } from '@cliffy/command';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Match from 'effect/Match';

import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  prettyPrintConfigError,
  Workspace,
} from '@dwkt/core';
import { Output } from '../../utils/output.ts';
import { ProgressSpinner } from '../../utils/spinner.ts';
import { displayWorkspaceInfo } from '../../utils/workspace-display.ts';

/**
 * Handle transformation errors with detailed, context-specific messages
 */
function handleTransformError(error: unknown): never {
  if (typeof error === 'object' && error !== null && '_tag' in error) {
    const exitCode = Match.value(error).pipe(
      Match.tag('ConfigNotFoundError', (configError) => {
        Output.error('❌ Configuration Error:');
        Output.error(configError.message);
        Output.blank();
        Output.warning('💡 Hint: Create a darwinkit.json configuration file.');
        Output.warning('   See documentation for configuration format.');
        return 3;
      }),
      Match.tag('ConfigParseError', (configError) => {
        Output.error('❌ Configuration parse error:');
        Output.error(configError.message);
        if (configError.configPath) {
          Output.muted(`Config file: ${configError.configPath}`);
        }
        return 3;
      }),
      Match.tag('ConfigValidationError', (configError) => {
        Output.error('❌ Configuration validation failed:');
        Output.error(configError.message);
        if (configError.validationErrors) {
          Output.blank();
          Output.error('Validation errors:');
          for (const err of configError.validationErrors) {
            Output.error(`  • ${err}`);
          }
        }
        return 3;
      }),
      Match.tag('TransformationError', (transformError) => {
        Output.error('❌ Transformation failed:');
        Output.error(transformError.message);
        return 1;
      }),
      Match.tag('OutputError', (outputError) => {
        Output.error('❌ Output operation failed:');
        Output.error(outputError.message);
        if (outputError.outputPath) {
          Output.muted(`Path: ${outputError.outputPath}`);
        }
        return 1;
      }),
      Match.tag('WorkspaceImportError', (importError) => {
        Output.error('❌ Import failed:');
        Output.error(importError.message);
        if (importError.path) {
          Output.muted(`Path: ${importError.path}`);
        }
        return 1;
      }),
      Match.orElse(() => {
        Output.error('❌ Unexpected error:');
        Output.error(String(error));
        return 3;
      }),
    );
    Deno.exit(exitCode);
  } else {
    Output.error('❌ Transformation failed:');
    Output.error(String(error));
    Deno.exit(3);
  }
}

/**
 * Display transformation summary after completion
 */
function displayTransformationSummary(workspace: Workspace, startTime: number) {
  const config = workspace.getConfig();
  const endTime = Date.now();
  const duration = endTime - startTime;

  Output.blank();
  Output.section('📊', 'Transformation Summary');

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
 * Handle CLI errors using Effect's Cause for better error messages
 */
function handleTransformErrorWithCause(cause: Cause.Cause<unknown>): never {
  Output.blank();

  try {
    const prettyMessage = prettyPrintConfigError(
      cause as Cause.Cause<
        | ConfigNotFoundError
        | ConfigParseError
        | ConfigValidationError
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
      handleTransformError(error);
    } else {
      Output.error('❌ Unexpected error occurred');
      Output.line(Cause.pretty(cause));
      Deno.exit(3);
    }
  }
}

async function transform(options: {
  config?: string;
  skipImport?: boolean;
  skipPostImport?: boolean;
  skipExport?: boolean;
}) {
  // Track timing for summary
  const startTime = Date.now();

  // Create spinner for transformation progress
  const spinner = new ProgressSpinner({ message: 'Discovering configuration...' });
  spinner.start();

  // Transformation pipeline using Effect
  const runTransformation = Effect.gen(function* (_) {
    const workspace = yield* _(Workspace.discover(options.config));

    spinner.stop();
    displayWorkspaceInfo(workspace);

    const datasets = workspace.getDatasets();

    // Execute transformation pipeline with progress updates
    spinner.start();

    // Update spinner message based on what's being done
    if (!options.skipImport) {
      spinner.update(`Importing CSV files from ${datasets.length} dataset(s)...`);
    } else if (!options.skipExport) {
      spinner.update('Exporting transformed data...');
    } else {
      spinner.update('Running transformation pipeline...');
    }

    // Execute transformation with options
    yield* _(workspace.transformer.run({
      skipImport: options.skipImport,
      skipPostImport: options.skipPostImport,
      skipExport: options.skipExport,
    }));

    spinner.stop();
    displayTransformationSummary(workspace, startTime);

    workspace.close();
  });

  // Run the Effect pipeline with Exit to preserve Cause information
  const result = await Effect.runPromiseExit(runTransformation);

  if (Exit.isFailure(result)) {
    spinner.stop();
    handleTransformErrorWithCause(result.cause);
  } else {
    Output.success('✅ Transformation complete');
    Deno.exit(0);
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
