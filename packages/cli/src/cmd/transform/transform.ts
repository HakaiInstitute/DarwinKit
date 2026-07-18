import { Command } from '@cliffy/command';
import { transformFile } from '@dwkit/core/transform';
import { Output } from '../../utils/output.ts';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Match from 'effect/Match';
import { outputTableResults, printSummary } from '../validate/validate.ts';

async function transform(options: {
  config?: string;
}) {
  Output.section('🚀', 'Starting transformation...');

  const result = await Effect.runPromiseExit(transformFile(options.config));

  if (Exit.isFailure(result)) {
    Output.blank();
    const failure = Cause.findErrorOption(result.cause);
    if (failure._tag === 'Some') {
      Output.error('Transformation failed:');
      Output.error(failure.value.message);
      Deno.exit(1);
    }
    Output.error('Unexpected error during transformation');
    Output.line(Cause.pretty(result.cause));
    Deno.exit(3);
  }

  const validation = result.value;

  // Reuse validate's renderer: same WorkspaceValidationResult, same one true rendering.
  outputTableResults(validation);
  printSummary(validation);

  Output.blank();
  Match.value(validation.overallStatus).pipe(
    Match.when(
      'fail',
      () =>
        Output.error(
          'Export blocked: no output files were written. Fix the errors above and re-run.',
        ),
    ),
    Match.when('warn', () => Output.success('✅ Transformation complete (with warnings).')),
    Match.when('pass', () => Output.success('✅ Transformation complete.')),
    Match.exhaustive,
  );

  const exitCode = Match.value(validation.overallStatus).pipe(
    Match.when('fail', () => 1),
    Match.when('warn', () => 0),
    Match.when('pass', () => 0),
    Match.exhaustive,
  );

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
  .action(transform);
