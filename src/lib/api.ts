import type { Budget, Expense, Group, Member } from './types';
import { getIdToken, logout } from './auth';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  'https://oxfhpuu8a8.execute-api.us-east-1.amazonaws.com/dev';

/** Carries the HTTP status so callers can treat 404 as "absent" not "broken". */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * One place to talk to the Lambda API.
 *
 * Every request carries the Cognito id token. API Gateway verifies it against
 * Cognito's signing keys before the Lambda runs, and the Lambda reads the user
 * id from those verified claims — so the client never gets to assert who it is.
 *
 * The `ok` check alone isn't enough either: a misconfigured API Gateway can hand
 * back HTTP 200 with a Lambda crash dump as the body. So every call also
 * confirms the field it actually needs is present, or a broken backend shows up
 * as phantom data instead of an error.
 */
async function request(path: string, init?: RequestInit) {
  const token = await getIdToken();
  if (!token) throw new ApiError('You are signed out. Sign in again to continue.', 401);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: token },
    });
  } catch {
    // Network down, DNS failure, or the browser blocked it (CORS).
    throw new Error('Could not reach the server. Check your connection.');
  }

  if (response.status === 401) {
    // Token rejected — expired beyond refresh, revoked, or issued by a user
    // pool that no longer exists. Nothing to do but sign in again.
    logout();
    throw new ApiError('Your session ended. Sign in again.', 401);
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
    throw new ApiError(message ?? `Request failed (HTTP ${response.status}).`, response.status);
  }

  return json;
}

export interface CreatedGroup {
  groupId: string;
  inviteCode: string;
}

/**
 * DynamoDB stores expenses under different field names than the app uses
 * (`amount`/`expenseId` vs `amountMinor`/`id`). Translating here keeps that
 * detail from leaking into components.
 */
interface WireExpense {
  groupId: string;
  expenseId: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  payerId: string;
  date: string;
  createdAt: number;
  splitBetween?: string[];
  baseAmountMinor?: number | null;
  rate?: number | null;
}

interface WireGroup {
  groupId: string;
  name: string;
  baseCurrency: string;
  inviteCode: string;
  members?: Member[];
}

function toGroup(wire: WireGroup): Group {
  return {
    id: wire.groupId,
    name: wire.name ?? '',
    baseCurrency: wire.baseCurrency ?? 'EUR',
    inviteCode: wire.inviteCode ?? '',
    members: wire.members ?? [],
  };
}

function toExpense(wire: WireExpense): Expense {
  return {
    id: wire.expenseId,
    groupId: wire.groupId,
    description: wire.description ?? '',
    amountMinor: wire.amount ?? 0,
    currency: wire.currency ?? 'EUR',
    category: wire.category ?? 'Other',
    payerId: wire.payerId ?? '',
    date: wire.date ?? '',
    // Rows written before splitting existed read as "paid for themselves",
    // which nets to zero rather than inventing debt nobody agreed to.
    splitBetween: wire.splitBetween ?? [wire.payerId],
    baseAmountMinor: wire.baseAmountMinor ?? null,
    rate: wire.rate ?? null,
  };
}

export async function createGroup(
  name: string,
  baseCurrency: string,
  yourName: string,
): Promise<CreatedGroup> {
  const json = (await request('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, baseCurrency, yourName }),
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
  splitBetween: string[],
): Promise<{ expenseId: string }> {
  const json = (await request('/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId, description, payerId, amount, currency, category, date, splitBetween,
    }),
  })) as { expenseId?: string };

  if (!json?.expenseId) {
    throw new Error('Server did not return an expense id.');
  }
  return { expenseId: json.expenseId };
}

export async function getExpenses(groupId: string): Promise<Expense[]> {
  const json = await request(`/groups/${encodeURIComponent(groupId)}/expenses`);
  if (!Array.isArray(json)) {
    throw new Error('Server did not return an expense list.');
  }
  return (json as WireExpense[]).map(toExpense);
}

export async function getGroup(groupId: string): Promise<Group> {
  const json = await request(`/groups/${encodeURIComponent(groupId)}`);
  return toGroup(json as WireGroup);
}

/** Returns null when no group has that code — a normal outcome, not an error. */
export async function getGroupByCode(inviteCode: string): Promise<Group | null> {
  try {
    const json = await request(`/invites/${encodeURIComponent(inviteCode)}`);
    return toGroup(json as WireGroup);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function joinGroup(groupId: string, name: string): Promise<Group> {
  const json = await request(`/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return toGroup(json as WireGroup);
}

export async function listUserGroups(): Promise<Group[]> {
  // No user id in the path — the server takes it from the token, so there's no
  // way to ask for someone else's groups.
  const json = await request('/me/groups');
  if (!Array.isArray(json)) {
    throw new Error('Server did not return a group list.');
  }
  return (json as WireGroup[]).map(toGroup);
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<void> {
  await request(
    `/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
    { method: 'DELETE' },
  );
}

export async function getBudgets(groupId: string): Promise<Budget[]> {
  const json = await request(`/groups/${encodeURIComponent(groupId)}/budgets`);
  if (!Array.isArray(json)) {
    throw new Error('Server did not return a budget list.');
  }
  return (json as { groupId: string; month: string; limitMinor: number }[]).map((b) => ({
    groupId: b.groupId,
    month: b.month,
    limitMinor: b.limitMinor ?? 0,
  }));
}

export async function setBudget(
  groupId: string,
  month: string,
  limitMinor: number,
): Promise<void> {
  await request(`/groups/${encodeURIComponent(groupId)}/budgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, limitMinor }),
  });
}

export async function editExpense(
  groupId: string,
  expenseId: string,
  description: string,
  payerId: string,
  amount: number,
  currency: string,
  category: string,
  date: string,
  splitBetween: string[],
): Promise<void> {
  await request(
    `/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, payerId, amount, currency, category, date, splitBetween }),
    },
  );
}