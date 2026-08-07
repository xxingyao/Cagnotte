import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const dynamodb = DynamoDBDocumentClient.from(client);

export async function getItem(table: string, key: Record<string, any>) {
  const result = await dynamodb.send(new GetCommand({
    TableName: table,
    Key: key,
  }));
  return result.Item;
}

export async function putItem(table: string, item: Record<string, any>) {
  await dynamodb.send(new PutCommand({
    TableName: table,
    Item: item,
  }));
}

export async function queryItems(table: string, keyCondition: string, expressionValues: Record<string, any>) {
  const result = await dynamodb.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: expressionValues,
  }));
  return result.Items || [];
}