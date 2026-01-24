import { Command } from '@cliffy/command';
import packageInfo from '../deno.json' with { type: 'json' };
import { importCommand } from './cmd/import/import.ts';
import { transformCommand } from './cmd/transform/transform.ts';
import { validateCommand } from './cmd/validate/validate.ts';

const darwinkit = new Command()
  .name('darwinkit')
  .version(packageInfo.version)
  .description('Tools for validating biodiversity datasets against Darwin Core standards')
  .meta('deno', Deno.version.deno)
  .meta('v8', Deno.version.v8)
  .meta('typescript', Deno.version.typescript)
  .meta('see', 'https://github.com/HakaiInstitute/DarwinKit')
  .action(function () {
    this.showHelp();
  })
  .command('import', importCommand)
  .command('validate', validateCommand)
  .command('transform', transformCommand);

await darwinkit.parse(Deno.args);
