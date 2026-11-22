import { parseArgs } from 'node:util';
import { report, run } from '../cli.ts';
import { checkPublished, exclusiveChannel, readPointer, resolveTarget, switchPointer } from './channel-target.ts';

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { target: { type: 'string' } } });
  if (!values.target) throw new Error('Usage: data:rollback --target <local-or-configured>');
  const directory = resolveTarget(values.target);
  report(await exclusiveChannel(directory, async () => {
    const pointer = await readPointer(directory);
    if (!pointer?.previous) throw new Error('This channel has no retained release');
    await checkPublished(directory, pointer.previous);
    return { status: 'published', target: values.target, ...await switchPointer(directory, pointer, pointer.previous) };
  }));
});
