import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito user pool for Cagnotte.
 *
 * MVP: email sign-up / sign-in only. Social providers (Google, Apple) and MFA
 * are a Phase 6 concern — adding them here later does not change the data model.
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailSubject: 'Your Cagnotte verification code',
      verificationEmailBody: (code: () => string) =>
        `Welcome to Cagnotte! Your verification code is ${code()}.`,
    },
  },
  userAttributes: {
    preferredUsername: { mutable: true, required: false },
  },
});
