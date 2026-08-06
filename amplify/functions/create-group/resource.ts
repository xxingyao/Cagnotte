import { defineFunction } from '@aws-amplify/backend';

export const createGroupFn = defineFunction({
  name: 'create-group',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
