import type { Budget, Expense, Friend, Group, Member } from './types';
import { getIdToken, logout } from './auth';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  'https://oxfhpuu8a8.execute-api.us-east-1.amazonaws.com/dev';

const cache = new Map<string, { data: unknown; at: number }>();
const CACHE_TTL = 60_000; // 1 minute

async function cachedRequest(path: string): Promise<unknown> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  const data = await request(path);
  cache.set(path, { data, at: Date.now() });
  return data;
}

function invalidate(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Carries the HTTP status so callers can treat 404 as "absent" not "broken". */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

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
    throw new Error('Could not reach the server. Check your connection.');
  }

  if (response.status === 401) {
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

export async function deleteGroup(groupId: string): Promise<void> {
  await request(`/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
}

export async function editGroupName(groupId: string, name: string): Promise<Group> {
  const json = await request(`/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return toGroup(json as WireGroup);
}

export async function uploadAvatar(imageBase64: string, contentType: string): Promise<void> {
  await request('/me/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, contentType }),
  });
}

// ─── Friends (request system) ───────────────────────────────────────────────

export async function listFriends(): Promise<Friend[]> {
  const json = await request('/friends');
  if (!Array.isArray(json)) {
    throw new Error('Server did not return a friends list.');
  }
  return json as Friend[];
}

export async function sendFriendRequest(email: string): Promise<Friend> {
  const json = (await request('/friends', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })) as Friend;
  return json;
}

export async function respondFriendRequest(
  friendId: string,
  action: 'accept' | 'decline',
): Promise<void> {
  await request(`/friends/${encodeURIComponent(friendId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

export async function removeFriend(friendId: string): Promise<void> {
  await request(`/friends/${encodeURIComponent(friendId)}`, { method: 'DELETE' });
}

// ─── Investments ────────────────────────────────────────────────────────────

export interface ApiInvestment {
  investmentId: string;
  name: string;
  type: string;
  icon: string;
  shares: number;
  costBasis: number;
  currentValue: number;
  updatedAt: string;
}

export async function listInvestments(): Promise<ApiInvestment[]> {
  const json = await cachedRequest('/me/investments');
  if (!Array.isArray(json)) throw new Error('Server did not return an investment list.');
  return json as ApiInvestment[];
}

export async function addInvestment(
  input: Omit<ApiInvestment, 'investmentId' | 'updatedAt'>,
): Promise<ApiInvestment> {
  const json = await request('/me/investments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  invalidate('/me/investments');
  return json as ApiInvestment;
}

export async function editInvestment(
  investmentId: string,
  input: Omit<ApiInvestment, 'investmentId' | 'updatedAt'>,
): Promise<void> {
  await request(`/me/investments/${encodeURIComponent(investmentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteInvestment(investmentId: string): Promise<void> {
  await request(`/me/investments/${encodeURIComponent(investmentId)}`, { method: 'DELETE' });
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export interface ApiAsset {
  assetId: string;
  name: string;
  category: string;
  icon: string;
  value: number;
  notes: string;
  lastUpdated: string;
}

export async function listAssets(): Promise<ApiAsset[]> {
  const json = await cachedRequest('/me/assets');
  if (!Array.isArray(json)) throw new Error('Server did not return an asset list.');
  return json as ApiAsset[];
}

export async function addAsset(input: Omit<ApiAsset, 'assetId' | 'lastUpdated'>): Promise<ApiAsset> {
  const json = await request('/me/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  invalidate('/me/assets');
  return json as ApiAsset;
}

export async function editAsset(assetId: string, input: Omit<ApiAsset, 'assetId' | 'lastUpdated'>): Promise<void> {
  await request(`/me/assets/${encodeURIComponent(assetId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteAsset(assetId: string): Promise<void> {
  await request(`/me/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
}