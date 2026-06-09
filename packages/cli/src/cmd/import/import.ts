import { Command } from '@cliffy/command';
import { import_schema } from '@dwkt/core/import';
import { join } from '@std/path';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { Output } from '../../utils/output.ts';

async function importSchema() {
  Output.section('🚀', 'Starting schema import from gbif...');

  const projectRoot = join(import.meta.dirname!, '..', '..', '..', '..', '..');
  const sourceDir = join(projectRoot, 'external');
  const outputDir = join(projectRoot, 'packages/domain/src/specs/generated');

  const result = await Effect.runPromiseExit(import_schema(sourceDir, outputDir));

  if (Exit.isFailure(result)) {
    Output.blank();
    const failure = Cause.findErrorOption(result.cause);
    if (failure._tag === 'Some') {
      Output.error('Schema import failed:');
      Output.error(failure.value.message);
      Deno.exit(1);
    }
    Output.error('Unexpected error during schema import');
    Output.line(Cause.pretty(result.cause));
    Deno.exit(3);
  }

  Output.success('✅ Import complete.');
}

export const importCommand = new Command()
  .description(
    'Run a import script to pull Obis XML Darwin Core schema information from gbif and convert to json.',
  )
  .action(importSchema);
