import { defineFunction } from '@aws-amplify/backend';

export const joinGroupFn = defineFunction({
  name: 'join-group',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
