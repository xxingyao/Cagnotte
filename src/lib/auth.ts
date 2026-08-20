const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  'https://oxfhpuu8a8.execute-api.us-east-1.amazonaws.com/dev';

const TOKEN_KEY = 'cagnotte.tokens';

interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
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
  } catch {}
}

function clearTokens(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function decodeClaims(idToken: string): { sub?: string; email?: string; name?: string } {
  try {
    const payload = idToken.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function authRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    const err = new Error((json as { error?: string }).error ?? 'Request failed');
    (err as unknown as { code: string }).code = (json as { code?: string }).code ?? '';
    throw err;
  }
  return json as Record<string, unknown>;
}

export async function signIn(email: string, password: string): Promise<void> {
  const json = await authRequest({ action: 'signIn', email, password });
  const tokens: Tokens = {
    idToken: json.idToken as string,
    accessToken: json.accessToken as string,
    refreshToken: json.refreshToken as string,
    expiresAt: Date.now() + (json.expiresIn as number) * 1000 - 30_000,
  };
  writeTokens(tokens);
}

export async function signUp(email: string, password: string, name: string): Promise<void> {
  await authRequest({ action: 'signUp', email, password, name });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await authRequest({ action: 'confirmSignUp', email, code });
}

export async function resendCode(email: string): Promise<void> {
  await authRequest({ action: 'resendCode', email });
}

export async function forgotPassword(email: string): Promise<void> {
  await authRequest({ action: 'forgotPassword', email });
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  await authRequest({ action: 'confirmForgotPassword', email, code, newPassword });
}

export function logout(): void {
  clearTokens();
  window.location.assign('/login');
}

export async function getIdToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.idToken;
  if (!tokens.refreshToken) {
    clearTokens();
    return null;
  }

  try {
    const json = await authRequest({ action: 'refresh', refreshToken: tokens.refreshToken });
    const updated: Tokens = {
      idToken: json.idToken as string,
      accessToken: json.accessToken as string,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (json.expiresIn as number) * 1000 - 30_000,
    };
    writeTokens(updated);
    return updated.idToken;
  } catch {
    clearTokens();
    return null;
  }
}

export function currentUser(): User | null {
  const tokens = readTokens();
  if (!tokens) return null;
  const claims = decodeClaims(tokens.idToken);
  if (!claims.sub) return null;
  return { id: claims.sub, email: claims.email ?? '', name: claims.name ?? '' };
}

/** Legacy — kept so StoreProvider doesn't break during migration. */
export async function login(): Promise<void> {
  window.location.assign('/login');
}

/** Legacy — no-op, login is no longer redirect-based. */
export async function completeLogin(): Promise<boolean> {
  return false;
}