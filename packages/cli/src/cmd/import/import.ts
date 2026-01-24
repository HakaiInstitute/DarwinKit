import { Command } from '@cliffy/command';
import { import_schema } from '@dwkt/core';
import { Output } from '../../utils/output.ts';

async function importSchema() {
  Output.section('Starting schema import from GBIF');
  await import_schema();
  Output.success('Import complete');
}

export const importCommand = new Command()
  .description(
    'Run a import script to pull Obis XML Darwin Core schema information from gbif and convert to json.',
  )
  .action(importSchema);
