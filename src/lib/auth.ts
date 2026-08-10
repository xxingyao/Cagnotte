/**
 * Cognito Hosted UI login, authorization-code flow with PKCE.
 *
 * PKCE rather than the implicit flow: a public browser client can't keep a
 * secret, and PKCE proves the code came from the same browser that started the
 * login without one. No SDK needed — it's four fetches and some base64.
 */

const DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '';
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '';

const TOKEN_KEY = 'cagnotte.tokens';
const VERIFIER_KEY = 'cagnotte.pkceVerifier';

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

/** Redirect URI has to match Cognito exactly, so derive it rather than configure it. */
function redirectUri(): string {
  return `${window.location.origin}/`;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function makeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

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

function storeFromResponse(json: {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}): Tokens {
  const previous = readTokens();
  const tokens: Tokens = {
    idToken: json.id_token,
    accessToken: json.access_token,
    // A refresh response doesn't return a new refresh token — keep the old one.
    refreshToken: json.refresh_token ?? previous?.refreshToken ?? '',
    // 30s of slack so a request doesn't leave with a token that expires mid-flight.
    expiresAt: Date.now() + json.expires_in * 1000 - 30_000,
  };
  writeTokens(tokens);
  return tokens;
}

/** Sends the browser to the Cognito Hosted UI. Never returns. */
export async function login(): Promise<void> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = await makeChallenge(verifier);
  window.sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.assign(`${DOMAIN}/oauth2/authorize?${params}`);
}

export function logout(): void {
  clearTokens();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: redirectUri(),
  });
  window.location.assign(`${DOMAIN}/logout?${params}`);
}

/**
 * If Cognito has just redirected back with `?code=`, swap it for tokens.
 * Returns true when a login completed on this page load.
 */
export async function completeLogin(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;

  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  window.sessionStorage.removeItem(VERIFIER_KEY);

  // Strip the code from the address bar before anything can await — a
  // reload with a spent code produces a confusing "invalid_grant".
  window.history.replaceState({}, '', url.pathname);
  if (!verifier) return false;

  const response = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });

  if (!response.ok) return false;
  storeFromResponse(await response.json());
  return true;
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

  const response = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!response.ok) {
    // Refresh token expired or revoked — sign back in.
    clearTokens();
    return null;
  }

  return storeFromResponse(await response.json()).idToken;
}

/** Who's signed in, from the cached token. Null if nobody. */
export function currentUser(): User | null {
  const tokens = readTokens();
  if (!tokens) return null;
  const claims = decodeClaims(tokens.idToken);
  if (!claims.sub) return null;
  return { id: claims.sub, email: claims.email ?? '', name: claims.name ?? '' };
}