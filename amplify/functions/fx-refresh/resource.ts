import { defineFunction } from '@aws-amplify/backend';

/**
 * Pulls the day's exchange rates into the Rate table. Scheduled by EventBridge,
 * which Amplify provisions from the `schedule` option below.
 */
export const fxRefreshFn = defineFunction({
  name: 'fx-refresh',
  entry: './handler.ts',
  schedule: 'every day',
  timeoutSeconds: 60,
  environment: {
    // Keyless endpoint by default. Point this at a paid provider (and add the
    // key as an Amplify secret) if you need better rate limits or accuracy.
    FX_API_URL: 'https://open.er-api.com/v6/latest/USD',
  },
});
