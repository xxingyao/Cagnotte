'use client';

import { Authenticator } from '@aws-amplify/ui-react';
import { backendConfigured } from '@/lib/amplify';

/**
 * Wraps the app in Cognito sign-in, and degrades to a readable message when the
 * backend hasn't been deployed yet (a fresh clone with no `ampx sandbox` run).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  if (!backendConfigured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Backend not connected</h1>
        <p className="text-slate-600">
          Cagnotte needs an Amplify backend before it can sign anyone in. Start one with:
        </p>
        <pre className="rounded-lg bg-ink p-4 text-sm text-white">npx ampx sandbox</pre>
        <p className="text-sm text-slate-500">
          That writes a real <code>amplify_outputs.json</code> and this page will pick it up on
          reload.
        </p>
      </main>
    );
  }

  return (
    <Authenticator signUpAttributes={['email']} className="pt-12">
      {() => <>{children}</>}
    </Authenticator>
  );
}
