# Cagnotte 💶

> A shared budget & expense tracker for people abroad together — multi-currency, monthly budgets, and real-time balances for your group.

**Status: hello world.** This is deliberately the smallest thing that can deploy — a single Next.js page and nothing else. No backend, no auth, no database. Features get added one at a time, each deployed and working before the next one starts.

The full plan lives in [`cagnotte-budget-tracker-synopsis-and-aws-plan.md`](./cagnotte-budget-tracker-synopsis-and-aws-plan.md).

---

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

```bash
npm run typecheck
npm run build
```

## Deploying

Amplify Hosting builds this from `amplify.yml` on every push to `main`. It is frontend-only right now — there is no `backend:` phase, because there is no backend.

---

## What's next

One step at a time, each deployed before moving on:

1. **Hello world on Amplify Hosting** ← we are here
2. Sign-in (Cognito) — the first AWS resource, nothing else
3. Create a group
4. Add an expense, split equally
5. Multi-currency conversion
6. Monthly budget
7. Balances and settle-up

---

## License

[MIT](./LICENSE)
