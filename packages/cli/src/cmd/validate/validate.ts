import { Command } from '@cliffy/command';
import * as Effect from 'effect/Effect';

import { Workspace } from '@dwkt/core';
import { JsonOutputStrategy, OutputStrategy, TableOutputStrategy } from './output-strategy.ts';

/**
 * Determine exit code based on validation status.
 * Pure function - no side effects.
 */
function getExitCodeFromValidationStatus(status: string): number {
  switch (status) {
    case 'fail':
      return 1;
    case 'warn':
      return 2;
    case 'pass':
      return 0;
    default:
      return 3;
  }
}

/**
 * Main validate function using OutputStrategy service for clean separation of concerns
 */
async function validate(options: {
  config?: string;
  files?: string;
  watch?: boolean;
  format?: string;
  failFast?: boolean;
}) {
  // Select output strategy based on format
  const validFormat = (options.format === 'json') ? 'json' : 'table';
  const outputLayer = validFormat === 'json' ? JsonOutputStrategy : TableOutputStrategy;

  // Validation pipeline using OutputStrategy service with error handling
  const program = Effect.gen(function* () {
    const output = yield* OutputStrategy;

    // Main validation flow - errors are caught and handled by strategy below
    const exitCode = yield* Effect.gen(function* () {
      // Discover workspace with optional progress feedback
      const workspace = yield* output.withProgress(
        'Discovering configuration...',
        () => Workspace.discover(options.config),
      );

      // Display workspace info (no-op for JSON output)
      yield* output.displayWorkspace(workspace);

      // Run validation with optional progress feedback
      const results = yield* output.withProgress(
        'Validating datasets...',
        () => workspace.validator.run({ failFast: options.failFast }),
      );

      workspace.close();

      // Output results (format-specific)
      yield* output.outputResults(results);

      // Determine exit code based on validation status
      // Note: The program succeeded (validation ran), but exit code reflects
      // whether the data passed validation (for CI/CD integration)
      return getExitCodeFromValidationStatus(results.overallStatus);
    }).pipe(
      Effect.catchAll((error) => output.handleError(error)),
    );

    return exitCode;
  }).pipe(
    Effect.provide(outputLayer),
  );

  Deno.exit(await Effect.runPromise(program));
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
    'Output format: table (default) or json (outputs to stdout)',
    { default: 'table' },
  )
  .option(
    '--fail-fast',
    'Stop validation on first dataset with errors (only validates required violations)',
    { default: false },
  )
  .action(validate);
