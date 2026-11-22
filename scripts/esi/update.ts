import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { report, run, workRoot } from '../cli.ts';
import { contractPath, diffContract } from './contract.ts';
import { stageContract } from './import.ts';

run(async () => {
  const { values } = parseArgs({ options: { date: { type: 'string' }, check: { type: 'boolean' }, from: { type: 'string' } } });
  if (!values.date) throw new Error('Usage: esi:update --date YYYY-MM-DD [--check]');
  const path = resolve(workRoot, 'esi', 'reports', `${values.date.replace(/[^0-9-]/g, '')}.json`);
  let result;
  try {
    const approved = JSON.parse(await readFile(contractPath, 'utf8'));
    const { directory, contract } = await stageContract(values.date, values.from);
    const differences = diffContract(approved, contract);
    result = { status: differences.length ? 'blocked' : approved.date === contract.date ? 'unchanged' : 'staged',
      date: contract.date, approvedDate: approved.date, sha256: contract.sha256, differences,
      path, candidate: values.check ? undefined : directory };
  } catch (error) {
    result = { status: 'blocked', path, reason: error instanceof Error ? error.message : String(error) };
  }
  await mkdir(resolve(workRoot, 'esi', 'reports'), { recursive: true });
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  report(result);
  if (result.status === 'blocked') process.exitCode = 1;
});
