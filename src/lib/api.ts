const API_BASE = 'https://oxfhpuu8a8.execute-api.us-east-1.amazonaws.com/dev';

export async function createGroup(name: string, baseCurrency: string, memberIds: string[]) {
  const response = await fetch(`${API_BASE}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, baseCurrency, memberIds }),
  });
  if (!response.ok) throw new Error('Failed to create group');
  return response.json();
}

export async function addExpense(groupId: string, description: string, payerId: string, amount: number, currency: string, category: string, date: string) {
  const response = await fetch(`${API_BASE}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, description, payerId, amount, currency, category, date }),
  });
  if (!response.ok) throw new Error('Failed to add expense');
  return response.json();
}

export async function getExpenses(groupId: string) {
  const response = await fetch(`${API_BASE}/groups/${groupId}/expenses`);
  if (!response.ok) throw new Error('Failed to fetch expenses');
  return response.json();
}

export async function getBalances(groupId: string) {
  const response = await fetch(`${API_BASE}/groups/${groupId}/balances`);
  if (!response.ok) throw new Error('Failed to fetch balances');
  return response.json();
}