const AVATAR_BASE =
  process.env.NEXT_PUBLIC_AVATAR_BASE_URL ?? 'https://cagnotte-avatars.s3.us-east-1.amazonaws.com';

/** Deterministic — every member's photo, if they have one, lives at this
 *  exact URL. Nothing needs to be stored anywhere to know where to look. */
export function avatarUrl(userId: string): string {
  return `${AVATAR_BASE}/avatars/${encodeURIComponent(userId)}`;
}