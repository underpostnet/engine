import { readFile } from 'node:fs/promises';
import { generateRandomStats, validateStats } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { PROGRESSION_RULES_DEFAULTS } from '../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { generateStatContract } from './stat-contract-generator.js';

export function registerStatCommands(program) {
  const stats = program.command('stats').description('Validate signed stats and inspect progression rules.');
  stats.command('random').option('--min <number>').option('--max <number>').action((options) => {
    const min = options.min === undefined ? undefined : Number(options.min);
    const max = options.max === undefined ? undefined : Number(options.max);
    console.log(JSON.stringify(generateRandomStats(min, max), null, 2));
  });
  stats.command('validate <file>').action(async (file) => {
    const input = JSON.parse(await readFile(file, 'utf8'));
    const records = Array.isArray(input) ? input : [input];
    for (const record of records) validateStats(record.data?.stats ?? record.stats ?? record);
    console.log(JSON.stringify({ valid: true, records: records.length }));
  });
  stats.command('progression').action(() => console.log(JSON.stringify(PROGRESSION_RULES_DEFAULTS, null, 2)));
  program.command('stat-contract').option('--check', 'Check generated Go and C files.').action(async (options) => {
    console.log(JSON.stringify(await generateStatContract({ check: !!options.check })));
  });
}
