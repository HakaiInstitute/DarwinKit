import { Command } from '@cliffy/command';
import { import_schema } from '@dwkt/core';
import { join } from '@std/path';
import * as Effect from 'effect/Effect';
import { Output } from '../../utils/output.ts';

async function importSchema() {
  Output.section('🚀', 'Starting schema import from gbif...');

  // Get external directory from project root (dev-only command)
  // TODO: Make it so this doesn't break when the cli is compiled
  const externalDir = join(Deno.cwd(), 'external');

  await Effect.runPromise(
    import_schema(externalDir),
  );

  Output.success('✅ Import complete.');
}

export const importCommand = new Command()
  .description(
    'Run a import script to pull Obis XML Darwin Core schema information from gbif and convert to json.',
  )
  .action(importSchema);
