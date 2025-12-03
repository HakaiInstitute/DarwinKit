import { Command } from '@cliffy/command';
import { transformFile } from '@dwkt/core';
import { Output } from '../../utils/output.ts';
import * as Effect from 'effect/Effect';

async function transform(options: {
  config?: string;
}) {
  Output.section('🚀', 'Starting transformation...');
  await Effect.runPromise(
    transformFile(options.config).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => Output.error(`Transformation failed: ${error.message}`))
      ),
    ),
  );
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
