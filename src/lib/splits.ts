/**
 * Splitting an expense across members.
 *
 * The MVP ships equal splits; the other three methods from the plan (shares,
 * percentage, exact) are here too because they are the same shape of problem and
 * the interesting part — making the parts sum to the total exactly — is shared.
 */

export interface SplitShare {
  userId: string;
  /** Minor units, in the group's base currency. */
  shareAmount: number;
}

/**
 * Splits `totalMinor` across `userIds` as evenly as integers allow, handing the
 * leftover minor units out one each. 10.00 across three people is 3.34/3.33/3.33
 * — never 3.33 × 3, which would quietly lose a cent from the group's books.
 */
export function splitEqual(totalMinor: number, userIds: string[]): SplitShare[] {
  return splitByWeights(
    totalMinor,
    userIds.map((userId) => ({ userId, weight: 1 }))
  );
}

/**
 * Splits proportionally to arbitrary weights — the shared engine behind
 * "by shares" (weight = share count) and "by percentage" (weight = percent).
 */
export function splitByWeights(
  totalMinor: number,
  weights: Array<{ userId: string; weight: number }>
): SplitShare[] {
  if (weights.length === 0) throw new Error('An expense needs at least one participant.');
  if (!Number.isInteger(totalMinor)) throw new Error('Amounts must be in whole minor units.');
  if (weights.some((w) => w.weight < 0)) throw new Error('Weights cannot be negative.');

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0) throw new Error('Weights must add up to more than zero.');

  const sign = totalMinor < 0 ? -1 : 1;
  const magnitude = Math.abs(totalMinor);

  const exact = weights.map((w) => (magnitude * w.weight) / totalWeight);
  const shares = exact.map(Math.floor);
  let remainder = magnitude - shares.reduce((sum, s) => sum + s, 0);

  // Largest fractional part first: the standard largest-remainder allocation, so
  // the rounding leftovers land where they were most nearly earned.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; remainder > 0; i = (i + 1) % order.length) {
    shares[order[i].index] += 1;
    remainder -= 1;
  }

  return weights.map((w, i) => ({ userId: w.userId, shareAmount: sign * shares[i] }));
}

/** Exact amounts, validated to sum to the expense total. */
export function splitExact(totalMinor: number, shares: SplitShare[]): SplitShare[] {
  const sum = shares.reduce((acc, s) => acc + s.shareAmount, 0);
  if (sum !== totalMinor) {
    throw new Error(
      `Split amounts add up to ${sum} but the expense is ${totalMinor} (minor units).`
    );
  }
  return shares;
}
