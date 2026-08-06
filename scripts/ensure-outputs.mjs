/**
 * Writes a placeholder `amplify_outputs.json` when there isn't a real one.
 *
 * The frontend imports that file directly, so without this a fresh clone cannot
 * typecheck or build until someone has deployed a backend. `npx ampx sandbox`
 * overwrites the placeholder with the real thing.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'amplify_outputs.json');

if (existsSync(target)) {
  process.exit(0);
}

writeFileSync(target, `${JSON.stringify({ version: '1.4' }, null, 2)}\n`);
console.log('Wrote placeholder amplify_outputs.json — run `npx ampx sandbox` for a real backend.');
