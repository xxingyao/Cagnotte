import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '$amplify/env/create-group';
import type { Schema } from '../../data/resource';
import { makeInviteCode, requireCaller, requireUserPoolId } from '../shared';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const data = generateClient<Schema>();
const cognito = new CognitoIdentityProviderClient();

/**
 * Creates a group and makes the caller its owner.
 *
 * The Cognito group is the security boundary: every row belonging to this
 * Cagnotte group carries `groupKey`, and AppSync only serves those rows to
 * callers whose ID token lists that group. Clients cannot add themselves.
 */
export const handler: Schema['createGroup']['functionHandler'] = async (event) => {
  const caller = requireCaller(event.identity);
  const userPoolId = requireUserPoolId();
  const { name, baseCurrency, displayName } = event.arguments;

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Group name is required.');
  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    throw new Error('baseCurrency must be a 3-letter ISO-4217 code, e.g. "SGD".');
  }

  const groupId = crypto.randomUUID();
  const groupKey = `grp_${groupId}`;
  const inviteCode = makeInviteCode();

  await cognito.send(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: groupKey,
      Description: `Cagnotte group "${trimmedName}"`,
    })
  );

  const { data: group, errors } = await data.models.Group.create({
    id: groupId,
    name: trimmedName,
    baseCurrency,
    groupKey,
    inviteCode,
    createdBy: caller.sub,
  });
  if (errors?.length || !group) {
    throw new Error(`Could not create group: ${JSON.stringify(errors)}`);
  }

  const { errors: membershipErrors } = await data.models.Membership.create({
    groupId,
    groupKey,
    userId: caller.sub,
    displayName: displayName.trim() || caller.username,
    email: caller.email,
    role: 'OWNER',
  });
  if (membershipErrors?.length) {
    throw new Error(`Could not create membership: ${JSON.stringify(membershipErrors)}`);
  }

  // Done last: until this succeeds the caller cannot read anything above, so a
  // partial failure leaves an orphaned group rather than a half-open one.
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: caller.username,
      GroupName: groupKey,
    })
  );

  return { groupId, groupKey, inviteCode, name: trimmedName, baseCurrency };
};
