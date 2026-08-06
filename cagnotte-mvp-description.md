# Cagnotte — MVP Scope

The smallest version of Cagnotte that is genuinely useful to a group abroad. If
a feature isn't needed to answer *"what have we spent, and who owes whom?"*, it
is not in the MVP.

---

## The one-sentence test

> Four friends share a flat in Lisbon. One pays rent in EUR, one buys groceries
> in EUR, one books a trip in GBP. At the end of the month they want to know how
> they did against their €1,200 budget and who should pay whom.

The MVP is done when that story works end to end, on two devices, live.

---

## In scope

| # | Capability | Status |
|---|---|---|
| 1 | Email sign-up / sign-in | ✅ built |
| 2 | Create a group with a base currency | ✅ built |
| 3 | Join a group with an invite code | ✅ built |
| 4 | Log an expense: amount, currency, category, date, payer | ✅ built |
| 5 | Split every expense **equally** among members | ✅ built |
| 6 | Convert to the group's base currency, keeping the original | ✅ built |
| 7 | Daily FX refresh into a cached rate table | ✅ built |
| 8 | One monthly budget per group, with a progress bar | ✅ built |
| 9 | Net balances per member (paid − owed) | ✅ built |
| 10 | "Settle up": fewest payments that clear the group | ✅ built |
| 11 | Real-time updates across devices | ✅ built |
| 12 | Per-group authorization enforced server-side | ✅ built |

## Explicitly *not* in the MVP

- Other split methods — shares, percentage, exact amounts. *(The logic exists and
  is tested in `src/lib/splits.ts`; only the UI is missing.)*
- Per-category budgets. One whole-group monthly limit is enough to be useful.
- Receipt photo uploads (S3).
- Push / email notifications for overspend.
- Charts, analytics, CSV export.
- Editing or deleting expenses.
- Recurring expenses.
- Social login, MFA.
- Any movement of actual money. Cagnotte records; people settle externally.

---

## Decisions the MVP locks in

**Money is integer minor units.** Every amount in the database is a whole number
of cents (or yen, or fils). Floats are never used for money — `src/lib/money.ts`
is the only place that converts between the two, and splits are checked to sum
exactly to the total.

**The original amount is immutable.** An expense stores `amountOriginal` +
`currencyOriginal` *and* `amountInBase` + `fxRateUsed`. Tomorrow's rates never
restate last week's spending.

**Authorization is a Cognito group per Cagnotte group.** Every row carries a
`groupKey`; AppSync checks it against the caller's token. Two Lambdas
(`createGroup`, `joinGroup`) are the only principals allowed to grant membership,
so a client cannot add itself to a group it wasn't invited to.

**Balances are computed, never stored.** `computeBalances` and `simplifyDebts`
are pure functions over expenses and splits, so there is no denormalised total
that can drift out of sync with the ledger.

---

## Known MVP limitations

These are real, deliberate, and worth saying out loud:

1. **Expense + splits are two writes, not one.** The client creates the `Expense`
   row, then the `Split` rows. A failure between the two leaves an expense with
   no splits — it will show in the list but not in balances. Fixing this means
   moving the write into a Lambda (see roadmap, Phase 2).
2. **Balances are computed on the client.** Fine for the 2–15 person groups
   Cagnotte targets; a group with tens of thousands of expenses would want this
   in a Lambda. The functions are pure and move without change.
3. **A new member doesn't retroactively join old expenses.** Splits are fixed at
   the moment an expense is logged, which is almost always what you want, but it
   means joining mid-month doesn't rewrite history.
4. **Rates are up to 24 hours old**, by design — they're indicative, not trading
   rates, and the cache is what keeps expense logging fast and provider-outage
   proof.
