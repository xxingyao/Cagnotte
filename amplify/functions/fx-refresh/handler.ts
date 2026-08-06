import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';
import { dataClientEnv } from '../shared';
import type { EventBridgeHandler } from 'aws-lambda';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(dataClientEnv());
Amplify.configure(resourceConfig, libraryOptions);

const data = generateClient<Schema>();

/** Currencies the MVP offers. Everything is stored as USD -> quote. */
const TRACKED = [
  'USD', 'EUR', 'GBP', 'SGD', 'AUD', 'NZD', 'JPY', 'KRW', 'CNY', 'HKD',
  'TWD', 'THB', 'MYR', 'IDR', 'VND', 'INR', 'PHP', 'CAD', 'CHF', 'SEK',
  'NOK', 'DKK', 'PLN', 'CZK', 'MXN', 'BRL', 'ZAR', 'AED', 'TRY',
];

interface FxResponse {
  result?: string;
  rates?: Record<string, number>;
}

/**
 * Daily refresh of the FX cache (EventBridge -> here -> Rate table).
 *
 * Conversions read this table rather than the upstream API, so logging an
 * expense stays fast and keeps working if the provider is down.
 */
export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async () => {
  const url = process.env.FX_API_URL ?? 'https://open.er-api.com/v6/latest/USD';

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FX provider returned ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as FxResponse;
  if (!payload.rates) throw new Error('FX provider returned no rates.');

  const fetchedAt = new Date().toISOString();
  const wanted = TRACKED.filter((code) => code === 'USD' || payload.rates![code] != null);

  const results = await Promise.allSettled(
    wanted.map((quote) =>
      data.models.Rate.create({
        base: 'USD',
        quote,
        rate: quote === 'USD' ? 1 : payload.rates![quote],
        fetchedAt,
      })
    )
  );

  // `create` on an existing primary key is a conflict, not a failure worth
  // retrying the whole run for — fall back to an update for those.
  const retries = results
    .map((result, i) => ({ result, quote: wanted[i] }))
    .filter(({ result }) => result.status === 'rejected' || result.value.errors?.length);

  for (const { quote } of retries) {
    await data.models.Rate.update({
      base: 'USD',
      quote,
      rate: quote === 'USD' ? 1 : payload.rates![quote],
      fetchedAt,
    });
  }

  console.log(`Refreshed ${wanted.length} FX rates (${retries.length} via update).`);
};
