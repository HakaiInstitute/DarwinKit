import { Command } from '@cliffy/command';
import { importCommand } from './src/cmd/import/import.ts';
import { validateCommand } from './src/cmd/validate/validate.ts';
import { transformCommand } from './src/cmd/transform/transform.ts';
import packageInfo from './deno.json' with { type: 'json' };
import { SCHEMA_VERSION } from '@dwkit/domain/version';

const dwkit = new Command()
  .name('dwkit')
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

// Intercept `--version` before Cliffy parses: clients read a {version, schemaVersion}
// JSON contract (see RELEASE_AND_DISTRIBUTION.md) that Cliffy's fixed-output version
// option cannot emit.
if (Deno.args.includes('--version') || Deno.args.includes('-V')) {
  const args = Deno.args;
  const eqFormat = args.find((a) => a.startsWith('--format='))?.split('=')[1];
  const flagIdx = args.findIndex((a) => a === '--format' || a === '-f');
  const format = eqFormat ?? (flagIdx >= 0 ? args[flagIdx + 1] : undefined);
  if (format === 'json') {
    console.log(JSON.stringify({ version: packageInfo.version, schemaVersion: SCHEMA_VERSION }));
  } else {
    console.log(packageInfo.version);
  }
  Deno.exit(0);
}

await dwkit.parse(Deno.args);
