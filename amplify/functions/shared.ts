/** Helpers shared by the Cagnotte Lambda handlers. */

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
