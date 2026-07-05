import { Command } from '@cliffy/command';
import { transformFile } from '@dwkit/core/transform';
import { Output } from '../../utils/output.ts';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

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

  Output.success('✅ Transformation complete.');
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
