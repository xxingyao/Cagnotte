/** Helpers shared by the Cagnotte Lambda handlers. */

/**
 * The environment `getAmplifyDataClientConfig` needs to reach the data API.
 *
 * Amplify can generate a typed `$amplify/env/<function>` shim for this, but that
 * file is written during CDK synth — so a clean checkout (CI, or Amplify
 * Hosting's first build) fails its TypeScript validation before anything has
 * generated it. The shim is defined as `export const env = process.env`, so
 * reading `process.env` here is identical at runtime and needs no build step.
 * SSM-backed secrets still resolve: that happens in an esbuild banner injected
 * into the bundle, independently of this import.
 */
export interface DataClientEnv {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN: string;
  AWS_REGION: string;
  AMPLIFY_DATA_DEFAULT_NAME: string;
  [key: string]: unknown;
}

const REQUIRED_DATA_ENV = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  'AMPLIFY_DATA_DEFAULT_NAME',
] as const;

/** Fails loudly at cold start rather than producing a misconfigured client. */
export function dataClientEnv(): DataClientEnv {
  const missing = REQUIRED_DATA_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Lambda environment variables: ${missing.join(', ')}. ` +
        'Grant this function data access with `allow.resource(fn)` in the schema.'
    );
  }
  return process.env as unknown as DataClientEnv;
}

export interface Caller {
  sub: string;
  username: string;
  email?: string;
}

/**
 * AppSync hands the resolver an `identity` union. Every mutation that reaches
 * these handlers is `userPool`-authorized, so anything else is a misconfiguration
 * and must fail loudly rather than fall through to an unauthenticated write.
 */
export function requireCaller(identity: unknown): Caller {
  const id = identity as
    | { sub?: string; username?: string; claims?: Record<string, unknown> }
    | null
    | undefined;
  if (!id?.sub || !id.username) {
    throw new Error('Unauthenticated: this mutation requires a signed-in user.');
  }
  const email = id.claims?.email;
  return {
    sub: id.sub,
    username: id.username,
    email: typeof email === 'string' ? email : undefined,
  };
}

export function requireUserPoolId(): string {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) throw new Error('USER_POOL_ID is not set on this function.');
  return userPoolId;
}

/** Ambiguous glyphs (0/O, 1/I/L) are left out so codes survive being read aloud. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function normaliseInviteCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 8) throw new Error('Invite codes are 8 characters, e.g. "7KQ4-B2XM".');
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
