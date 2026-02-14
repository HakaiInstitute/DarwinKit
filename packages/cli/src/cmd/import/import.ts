import { Command } from '@cliffy/command';
import { import_schema } from '@dwkt/core/import';
import { join } from '@std/path';
import * as Effect from 'effect/Effect';
import { Output } from '../../utils/output.ts';

async function importSchema() {
  Output.section('🚀', 'Starting schema import from gbif...');

  // Resolve paths relative to project root (this file is at packages/cli/src/cmd/import/)
  const projectRoot = join(import.meta.dirname!, '..', '..', '..', '..', '..');
  const sourceDir = join(projectRoot, 'external');
  const outputDir = join(projectRoot, 'packages/domain/src/specs/generated');

  await Effect.runPromise(
    import_schema(sourceDir, outputDir),
  );

  Output.success('✅ Import complete.');
}

export const importCommand = new Command()
  .description(
    'Run a import script to pull Obis XML Darwin Core schema information from gbif and convert to json.',
  )
  .action(importSchema);
