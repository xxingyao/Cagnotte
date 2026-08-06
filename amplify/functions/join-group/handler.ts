import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '$amplify/env/join-group';
import type { Schema } from '../../data/resource';
import { normaliseInviteCode, requireCaller, requireUserPoolId } from '../shared';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const data = generateClient<Schema>();
const cognito = new CognitoIdentityProviderClient();

/**
 * Redeems an invite code. This is the only path into a group's data, which is
 * why it runs in a Lambda: the client never gets permission to add itself to a
 * Cognito group.
 */
export const handler: Schema['joinGroup']['functionHandler'] = async (event) => {
  const caller = requireCaller(event.identity);
  const userPoolId = requireUserPoolId();
  const inviteCode = normaliseInviteCode(event.arguments.inviteCode);

  const { data: matches, errors } = await data.models.Group.listGroupByInviteCode({
    inviteCode,
  });
  if (errors?.length) {
    throw new Error(`Could not look up invite code: ${JSON.stringify(errors)}`);
  }
  const group = matches?.[0];
  if (!group) throw new Error('That invite code does not match any group.');

  const { data: existing } = await data.models.Membership.listMembershipByUserId({
    userId: caller.sub,
  });
  const alreadyMember = (existing ?? []).some((m) => m.groupId === group.id);

  if (!alreadyMember) {
    const { errors: membershipErrors } = await data.models.Membership.create({
      groupId: group.id,
      groupKey: group.groupKey,
      userId: caller.sub,
      displayName: event.arguments.displayName.trim() || caller.username,
      email: caller.email,
      role: 'MEMBER',
    });
    if (membershipErrors?.length) {
      throw new Error(`Could not join group: ${JSON.stringify(membershipErrors)}`);
    }
  }

  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: caller.username,
      GroupName: group.groupKey,
    })
  );

  return {
    groupId: group.id,
    groupKey: group.groupKey,
    inviteCode: group.inviteCode,
    name: group.name,
    baseCurrency: group.baseCurrency,
  };
};
