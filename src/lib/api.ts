const API_BASE = 'https://oxfhpuu8a8.execute-api.us-east-1.amazonaws.com/dev';

/**
 * One place to talk to the Lambda API.
 *
 * The `ok` check alone isn't enough: a misconfigured API Gateway can hand back
 * HTTP 200 with a Lambda crash dump as the body. So every call also has to
 * confirm the field it actually needs is present, or a broken backend shows up
 * as phantom data instead of an error.
 */
async function request(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    // Network down, DNS failure, or the browser blocked it (CORS).
    throw new Error('Could not reach the server. Check your connection.');
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Server returned a non-JSON response (HTTP ${response.status}).`);
  }

  // A Lambda that failed to start reports itself in the body, not the status.
  const asError = json as { errorMessage?: string; error?: string } | null;
  const message = asError?.errorMessage ?? asError?.error;
  if (!response.ok || message) {
    throw new Error(message ?? `Request failed (HTTP ${response.status}).`);
  }

  return json;
}

export interface CreatedGroup {
  groupId: string;
  inviteCode: string;
}

export async function createGroup(
  name: string,
  baseCurrency: string,
  memberIds: string[],
): Promise<CreatedGroup> {
  const json = (await request('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, baseCurrency, memberIds }),
  })) as Partial<CreatedGroup>;

  if (!json?.groupId || !json?.inviteCode) {
    throw new Error('Server did not return a group id.');
  }
  return { groupId: json.groupId, inviteCode: json.inviteCode };
}

export async function addExpense(
  groupId: string,
  description: string,
  payerId: string,
  amount: number,
  currency: string,
  category: string,
  date: string,
): Promise<{ expenseId: string }> {
  const json = (await request('/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, description, payerId, amount, currency, category, date }),
  })) as { expenseId?: string };

  if (!json?.expenseId) {
    throw new Error('Server did not return an expense id.');
  }
  return { expenseId: json.expenseId };
}

export async function getExpenses(groupId: string): Promise<unknown[]> {
  const json = await request(`/groups/${encodeURIComponent(groupId)}/expenses`);
  if (!Array.isArray(json)) {
    throw new Error('Server did not return an expense list.');
  }
  return json;
}

export async function getBalances(groupId: string): Promise<Record<string, number>> {
  const json = await request(`/groups/${encodeURIComponent(groupId)}/balances`);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Server did not return balances.');
  }
  return json as Record<string, number>;
}