import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isIdentifier } from '../../src/storage/catalog-contract.ts';
import { report, run, workRoot } from '../cli.ts';
import { readArtifactTree } from './artifacts.ts';
import { exclusiveChannel, readPointer, resolveTarget, stagePublication, switchPointer } from './channel-target.ts';
import { acceptancePath, verificationFingerprint } from './verify.ts';

export async function publishCandidate(id: string, target: string) {
  const directory = resolveTarget(target);
  const candidate = await readArtifactTree(resolve(workRoot, 'candidates', id));
  if (candidate.manifest.compatibilityId !== id) throw new Error('Candidate ID does not match its manifest');
  const receipt = JSON.parse(await readFile(acceptancePath(id), 'utf8').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Verify the candidate before publishing');
    throw error;
  }));
  if (receipt.status !== 'verified' || receipt.candidateId !== id ||
      receipt.fingerprint !== await verificationFingerprint(candidate.bytes)) throw new Error('A fresh verification report is required');
  return exclusiveChannel(directory, async () => {
    const current = await readPointer(directory);
    const reference = await stagePublication(directory, candidate);
    const pointer = await switchPointer(directory, current, reference);
    return { status: pointer === current ? 'unchanged' : 'published', target, ...pointer };
  });
}

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { candidate: { type: 'string' }, target: { type: 'string' } } });
  if (!isIdentifier(values.candidate) || !values.target) throw new Error('Usage: data:publish --candidate <id> --target <local-or-configured>');
  report(await publishCandidate(values.candidate, values.target));
});
