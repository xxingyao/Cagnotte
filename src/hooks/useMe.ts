'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth';

export interface Me {
  /** Cognito `sub` — the id every expense, split and membership references. */
  sub: string;
  username: string;
  email?: string;
  displayName: string;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [user, attributes] = await Promise.all([getCurrentUser(), fetchUserAttributes()]);
        if (cancelled) return;
        setMe({
          sub: user.userId,
          username: user.username,
          email: attributes.email,
          displayName:
            attributes.preferred_username || attributes.email?.split('@')[0] || user.username,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { me, loading };
}

/**
 * Group membership lives in the ID token, so after joining or creating a group
 * the token has to be re-minted before AppSync will serve that group's rows.
 */
export async function refreshGroupClaims() {
  await fetchAuthSession({ forceRefresh: true });
}
