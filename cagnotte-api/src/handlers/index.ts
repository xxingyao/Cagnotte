import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuid } from 'uuid';
import { dynamodb, putItem, queryItems } from '../utils/dynamodb';

const GROUPS_TABLE = process.env.GROUPS_TABLE || 'cagnotte-groups';
const EXPENSES_TABLE = process.env.EXPENSES_TABLE || 'cagnotte-expenses';

// Helper: Generate invite code (4-4 format, exclude confusing chars)
function generateInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0, O, 1, I
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const createGroup: APIGatewayProxyHandler = async (event) => {
  try {
    const { name, baseCurrency, memberIds } = JSON.parse(event.body || '{}');
    const groupId = uuid();
    const inviteCode = generateInviteCode();

    await putItem(GROUPS_TABLE, {
      groupId,
      name,
      baseCurrency,
      inviteCode,
      memberIds: memberIds || [],
      createdAt: Date.now(),
    });

    return {
      statusCode: 201,
      body: JSON.stringify({ groupId, inviteCode }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: String(error) }),
    };
  }
};

export const addExpense: APIGatewayProxyHandler = async (event) => {
  try {
    const { groupId, description, payerId, amount, currency, category, date } = JSON.parse(event.body || '{}');
    const expenseId = uuid();

    await putItem(EXPENSES_TABLE, {
      groupId,
      expenseId,
      description,
      payerId,
      amount, // already in cents from frontend
      currency,
      category,
      date,
      createdAt: Date.now(),
    });

    return {
      statusCode: 201,
      body: JSON.stringify({ expenseId }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: String(error) }),
    };
  }
};

export const getExpenses: APIGatewayProxyHandler = async (event) => {
  try {
    const { groupId } = event.pathParameters || {};
    const items = await queryItems(EXPENSES_TABLE, 'groupId = :gid', { ':gid': groupId });

    return {
      statusCode: 200,
      body: JSON.stringify(items.sort((a: any, b: any) => b.createdAt - a.createdAt)),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: String(error) }),
    };
  }
};

export const getBalances: APIGatewayProxyHandler = async (event) => {
  try {
    const { groupId } = event.pathParameters || {};
    const expenses = await queryItems(EXPENSES_TABLE, 'groupId = :gid', { ':gid': groupId });

    // Calculate balances: who owes/is owed what
    const balances: Record<string, number> = {};
    for (const expense of expenses) {
      const { payerId, amount } = expense;
      if (!balances[payerId]) balances[payerId] = 0;
      balances[payerId] += amount;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(balances),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: String(error) }),
    };
  }
};