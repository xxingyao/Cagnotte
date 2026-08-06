/**
 * Asserts that `amplify/backend.ts` and everything it imports can actually be
 * loaded the way Amplify loads it.
 *
 * `ampx pipeline-deploy` does not run the backend through the tsx CLI — it calls
 * `tsImport()` from a module inside node_modules. That scoped loader resolves
 * differently, and if `amplify/` is not ESM it cannot resolve the extensionless
 * relative imports in backend.ts at all. A deploy then fails with
 * ERR_MODULE_NOT_FOUND even though tsc, the tests, and the frontend build are
 * all green — which is exactly what happened, twice.
 *
 * Loading the backend fully would need CDK context that only a real deploy has,
 * so reaching that context error is the success condition: it means the whole
 * module graph resolved.
 */
import { tsImport } from 'tsx/esm/api';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const backend = path.resolve(import.meta.dirname, '..', 'amplify', 'backend.ts');

/** Thrown once the module graph is loaded and CDK wants a real backend id. */
const EXPECTED = 'No context value present for amplify-backend-namespace key';

try {
  await tsImport(pathToFileURL(backend).toString(), import.meta.url);
  console.log('✓ Backend module graph loaded.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes(EXPECTED)) {
    console.log('✓ Backend module graph resolved (stopped at CDK context, as expected).');
    process.exit(0);
  }

  const code = error?.code ?? '';
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
    console.error(`✗ Amplify could not resolve a backend import:\n  ${message}\n`);
    console.error(
      'Most likely `amplify/package.json` is missing or no longer declares\n' +
        '{"type": "module"} — Amplify Gen 2 backends must be ESM.'
    );
    process.exit(1);
  }

  console.error(`✗ Backend failed to load:\n  ${message}`);
  process.exit(1);
}
