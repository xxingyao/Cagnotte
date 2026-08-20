/**
 * Custom authentication via the cagnotte-auth Lambda.
 *
 * Direct Cognito API calls through our Lambda, not the Hosted UI —
 * login and signup happen on our own pages at /login.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  'https://oxfhpuu8a8.execute-api.us-east-1.amazonaws.com/dev';

const TOKEN_KEY = 'cagnotte.tokens';

interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the id token stops being valid. */
  expiresAt: number;
}

export interface User {
  /** Cognito's `sub` — stable for this person across every device. */
  id: string;
  email: string;
  name: string;
}

// ─── Token storage ───────────────────────────────────────────────────────────

function readTokens(): Tokens | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    // Storage blocked: the session still works until the tab closes.
  }
}

function clearTokens(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * Reads the claims without verifying the signature.
 *
 * Safe here because this only decides what to show — the API is what must
 * verify, and that's the Cognito authorizer's job. Never trust these claims
 * for anything that grants access.
 */
function decodeClaims(idToken: string): { sub?: string; email?: string; name?: string; exp?: number } {
  try {
    const payload = idToken.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

// ─── Auth Lambda requests ────────────────────────────────────────────────────

async function authRequest(action: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });

  let json: Record<string, unknown>;
  try {
    json = await response.json();
  } catch {
    throw new Error('Auth server returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error((json?.error as string) || (json?.message as string) || 'Authentication failed.');
  }
  return json;
}

// ─── Public auth actions ─────────────────────────────────────────────────────

/** Sign in with email and password. Stores tokens on success. */
export async function signIn(email: string, password: string): Promise<void> {
  const json = await authRequest('signIn', { email, password });
  const tokens: Tokens = {
    idToken: json.idToken as string,
    accessToken: json.accessToken as string,
    refreshToken: json.refreshToken as string,
    // 30s of slack so a request doesn't leave with a token that expires mid-flight.
    expiresAt: Date.now() + (json.expiresIn as number) * 1000 - 30_000,
  };
  writeTokens(tokens);
}

/** Create a new account. Returns the user's sub. Needs email confirmation. */
export async function signUp(email: string, password: string, name?: string): Promise<string> {
  const json = await authRequest('signUp', {
    email,
    password,
    name: name || email.split('@')[0],
  });
  return json.userSub as string;
}

/** Confirm a new account with the verification code emailed during sign-up. */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  await authRequest('confirmSignUp', { email, code });
}

/** Resend the verification code to the email used during sign-up. */
export async function resendCode(email: string): Promise<void> {
  await authRequest('resendCode', { email });
}

/** Start the forgot-password flow — Cognito sends a reset code to the email. */
export async function forgotPassword(email: string): Promise<void> {
  await authRequest('forgotPassword', { email });
}

/** Complete the password reset with the code and new password. */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await authRequest('confirmForgotPassword', { email, code, newPassword });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** Redirects to the login page. Kept for callers that used the old Hosted UI flow. */
export async function login(): Promise<void> {
  window.location.href = '/login';
}

/** Clears tokens and sends the user to /login. */
export function logout(): void {
  clearTokens();
  window.location.href = '/login';
}

/**
 * Legacy stub — the Hosted UI redirect flow used to land back with ?code=,
 * and this function exchanged it for tokens. With the custom login page,
 * there's nothing to complete on page load.
 */
export async function completeLogin(): Promise<boolean> {
  return false;
}

/** A valid id token, refreshing if needed. Null means "not signed in". */
export async function getIdToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.idToken;
  if (!tokens.refreshToken) {
    clearTokens();
    return null;
  }

  try {
    const json = await authRequest('refresh', { refreshToken: tokens.refreshToken });
    const updated: Tokens = {
      idToken: json.idToken as string,
      accessToken: json.accessToken as string,
      // A refresh response doesn't return a new refresh token — keep the old one.
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (json.expiresIn as number) * 1000 - 30_000,
    };
    writeTokens(updated);
    return updated.idToken;
  } catch {
    // Refresh token expired or revoked — sign back in.
    clearTokens();
    return null;
  }
}

/** Who's signed in, from the cached token. Null if nobody. */
export function currentUser(): User | null {
  const tokens = readTokens();
  if (!tokens) return null;
  const claims = decodeClaims(tokens.idToken);
  if (!claims.sub) return null;
  return { id: claims.sub, email: claims.email ?? '', name: claims.name ?? '' };
}
