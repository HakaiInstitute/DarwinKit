import { Command } from '@cliffy/command';
import { validateCommand } from './src/cmd/validate/validate.ts';
import { transformCommand } from './src/cmd/transform/transform.ts';
import packageInfo from './deno.json' with { type: 'json' };

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
  .command('validate', validateCommand)
  .command('transform', transformCommand);

await darwinkit.parse(Deno.args);
