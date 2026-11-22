import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { report, run, workRoot } from '../cli.ts';
import { fetchBytes } from '../data/snapshot.ts';
import { extractContract, openApiUrl } from './contract.ts';

export async function stageContract(date: string, filename?: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error('Expected --date YYYY-MM-DD');
  const bytes = filename ? await readFile(filename) : await fetchBytes(new URL(openApiUrl(date)));
  const contract = extractContract(bytes, date);
  const directory = resolve(workRoot, 'esi', date, contract.sha256);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, 'openapi.json'), bytes),
    writeFile(resolve(directory, 'contract.json'), JSON.stringify(contract, null, 2) + '\n'),
  ]);
  return { directory, contract };
}

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { date: { type: 'string' }, from: { type: 'string' } } });
  if (!values.date) throw new Error('Usage: esi:import --date YYYY-MM-DD [--from path]');
  const { directory, contract } = await stageContract(values.date, values.from);
  report({ status: 'staged', path: directory, date: contract.date, source: contract.source,
    sha256: contract.sha256, operations: Object.keys(contract.operations) });
});
