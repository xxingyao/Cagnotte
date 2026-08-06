import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { createGroupFn } from './functions/create-group/resource';
import { joinGroupFn } from './functions/join-group/resource';
import { fxRefreshFn } from './functions/fx-refresh/resource';

const backend = defineBackend({
  auth,
  data,
  createGroupFn,
  joinGroupFn,
  fxRefreshFn,
});

const userPool = backend.auth.resources.userPool;

/**
 * Membership is granted exclusively by these two functions, so they are the only
 * principals allowed to touch Cognito groups. Scoped to this user pool.
 */
for (const fn of [backend.createGroupFn, backend.joinGroupFn]) {
  fn.addEnvironment('USER_POOL_ID', userPool.userPoolId);
  fn.resources.lambda.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'cognito-idp:CreateGroup',
        'cognito-idp:GetGroup',
        'cognito-idp:AdminAddUserToGroup',
      ],
      resources: [userPool.userPoolArn],
    })
  );
}

export default backend;
