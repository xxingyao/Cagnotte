# Cagnotte — Shared Budget Tracker for People Abroad Together
### Project Synopsis & AWS Build Plan

> *Cagnotte* is French for the shared "kitty" — the pot of money friends pool
> together. A group budgeting and expense-splitting app for people living or
> travelling overseas together, with multi-currency support and monthly budgets.

---

## PART A — PROJECT SYNOPSIS

### 1. Background & Problem Statement

When people share life overseas — travel companions on a long trip, students on
exchange, expat flatmates, couples relocating, or friends on a working holiday —
money quickly becomes tangled. Expenses are paid by different people, in
different currencies, across shifting exchange rates, and against a shared
monthly budget nobody can quite see. Existing tools tend to solve one half of the
problem: personal budgeting apps ignore the "who-owes-whom" of a group, while
bill-splitting apps ignore forward-looking *budgets* and rarely handle multiple
currencies well.

**Cagnotte** unifies both: a shared monthly budget *and* fair expense-splitting,
currency-aware from the ground up, updating in real time for every member.

### 2. Aim

To design and build a cloud-native, multi-currency application that lets a group
of people abroad set shared monthly budgets, log and split expenses fairly, and
see — live and in a common currency — where they stand and who owes whom.

### 3. Objectives

- Enable users to form **groups** (a trip, a household, a semester abroad) and invite members.
- Let members **log expenses** in any currency, tagged by category and payer.
- Support flexible **splitting** (equal, by shares, by percentage, or exact amounts).
- Maintain a **monthly budget** per group and per category, with overspend alerts.
- Convert all amounts into a **group base currency** using current exchange rates, while preserving the original.
- Compute **net balances** and a minimal set of **settlement** transactions ("A pays B $X").
- Deliver **real-time updates** so every member sees new expenses instantly.
- Run cost-effectively and scalably on **AWS serverless** infrastructure.

### 4. Target Users

Primary: small groups (2–15 people) sharing finances abroad — travel groups,
expat/student flatmates, couples relocating, working-holiday friends. Secondary:
any group needing shared, currency-aware budgeting (family trips, small clubs).

### 5. Scope

**In scope (MVP):** user accounts, group creation/invites, multi-currency expense
logging, splitting logic, monthly budgets, FX conversion, balances & settlement,
real-time sync, basic reports, receipt photo attachments.

**Out of scope (initially):** direct bank/card integration, in-app payment
settlement (users settle externally), tax/accounting features, offline-first sync.

### 6. Key Features

**Must-have (MVP)**

- Sign-up / sign-in with email + social login.
- Create groups; invite members by link or email; assign a base currency per group.
- Add an expense: amount, currency, category, date, payer, split method, notes, optional receipt photo.
- Automatic currency conversion to the group's base currency.
- Monthly budget per group (and optionally per category) with a progress view and overspend alerts.
- Live balances: what each person has paid vs. owes.
- "Settle up" view: the smallest set of payments to square the group.
- Real-time updates across all members' devices.

**Nice-to-have (stretch)**

- Recurring expenses (rent, subscriptions).
- Spending analytics & monthly trend charts.
- Export to CSV/PDF.
- Push/email notifications ("You've used 85% of March's budget").
- Multi-group dashboard and per-user personal view across groups.

> See [`cagnotte-mvp-description.md`](./cagnotte-mvp-description.md) for how this
> list was cut down to a first shippable version.

### 7. Proposed Technology Stack

| Layer | Choice |
|---|---|
| Frontend | React (Next.js), TypeScript, Tailwind |
| Backend / Cloud | **AWS Amplify Gen 2** (Cognito + AppSync GraphQL + DynamoDB + Lambda) |
| Hosting / CI-CD | AWS Amplify Hosting (Git-based deploys) |
| File storage | Amazon S3 (receipt images) via Amplify Storage |
| FX rates | External exchange-rate API pulled on a schedule (EventBridge + Lambda) |
| Notifications | Amazon SNS / Pinpoint (push + email) |

### 8. Expected Outcomes & Significance

A working, deployed application demonstrating a modern serverless architecture,
real-time collaborative data, and non-trivial domain logic (multi-currency
accounting and debt-simplification). It solves a genuine, common pain for a
mobile, borderless generation, and showcases full-stack cloud competency.

### 9. Assumptions & Limitations

- Users settle debts *outside* the app (no money movement inside it), avoiding payments-licensing complexity.
- Exchange rates are indicative (daily refresh), not guaranteed real-time trading rates.
- The app assumes reasonable trust within a group (it records, it doesn't enforce).

---

## PART B — HOW TO BUILD IT ON AWS

### 1. Architecture — Serverless (Amplify Gen 2)

AppSync provides real-time sync out of the box, which is exactly what a shared
tracker wants.

```
                 ┌─────────────────────────────────────────────┐
                 │            Users (web / mobile)             │
                 └───────────────────┬─────────────────────────┘
                                     │  HTTPS
                 ┌───────────────────▼─────────────────────────┐
                 │  Amplify Hosting  (React/Next.js frontend)   │
                 └───────────────────┬─────────────────────────┘
                                     │  GraphQL (queries / mutations / subscriptions)
   ┌─────────────────────────────────▼───────────────────────────────────┐
   │                       AWS AppSync (GraphQL API)                      │
   │        auth guarded by Amazon Cognito (user pools + groups)          │
   └───┬───────────────┬──────────────────┬─────────────────┬────────────┘
       │               │                  │                 │
 ┌─────▼─────┐   ┌─────▼──────┐    ┌──────▼────────┐  ┌─────▼────────┐
 │ DynamoDB  │   │  Lambda    │    │      S3       │  │  Lambda      │
 │  tables   │   │ (business  │    │  (receipts)   │  │ (FX refresh, │
 │ Groups,   │   │  logic:    │    │               │  │  scheduled   │
 │ Members,  │   │  groups,   │    └───────────────┘  │  via         │
 │ Expenses, │   │  splitting)│                       │ EventBridge) │
 │ Budgets,  │   └────────────┘                       └──────┬───────┘
 │ Rates     │                                               │
 └───────────┘                                    external FX rate API
```

**How each AWS piece maps to a need:**

- **Amazon Cognito** → sign-up/sign-in and per-user identity. Also the
  authorization boundary: one Cognito group per Cagnotte group.
- **AWS AppSync (GraphQL)** → the API. Models are declared in TypeScript; Amplify
  generates schema, resolvers, and subscriptions that push live changes to every
  member.
- **Amazon DynamoDB** → one table per model, on-demand billing, scales to near-zero when idle.
- **AWS Lambda** → logic that doesn't belong in a CRUD resolver: group creation
  and joining, FX refresh, and (next) atomic expense+split writes.
- **Amazon EventBridge** → the daily schedule behind the FX-refresh Lambda.
- **Amazon S3** → receipt photo storage via Amplify Storage.
- **Amazon SNS / Pinpoint** → budget-overspend and reminder notifications.
- **Amplify Hosting** → connect the GitHub repo; every push builds and deploys.

### 2. Data Model

Declared in [`amplify/data/resource.ts`](./amplify/data/resource.ts); Amplify
provisions the AppSync API and DynamoDB tables from it.

- **Group** — id, name, baseCurrency, groupKey, inviteCode, createdBy.
- **Membership** — links a user to a group, with a role (owner/member).
- **Expense** — id, groupId, payerId, amountOriginal, currencyOriginal, amountInBase, fxRateUsed, category, date, note.
- **Split** — id, expenseId, userId, shareAmount.
- **Budget** — id, groupId, month (`2026-03`), limitInBase.
- **Rate** — base, quote, rate, fetchedAt (the cached FX table).

> **Authorization is the important bit:** every group-scoped row carries a
> `groupKey` naming a Cognito group, and AppSync checks it against the caller's
> token. Only the `createGroup` and `joinGroup` Lambdas can grant membership.

### 3. The Two Pieces of Real Domain Logic

**a) Multi-currency handling** — always store the **original amount + currency**
*and* a **converted amount**, plus the **rate used**. Never overwrite the
original; you want an auditable record even after rates move. A scheduled Lambda
pulls rates into the `Rate` table daily; conversions read that cache (fast, cheap,
resilient to provider outages). Show users both figures ("€45.00 · ≈ S$65.30").

**b) Expense splitting & settlement** — four split methods (equal, shares,
percentage, exact), each producing one `Split` row per member. Sum each member's
*paid* minus *owed* for a **net balance**, then run a **debt-simplification**
pass: repeatedly match the largest debtor to the largest creditor. Five people
end up making at most four payments instead of twelve.

### 4. Build Roadmap

- **Phase 0 — Setup.** Scaffold Amplify Gen 2 + Next.js, connect Amplify Hosting. ✅
- **Phase 1 — Auth & groups.** Cognito sign-in, create/join groups, membership rules. ✅
- **Phase 2 — Expenses & splitting.** Expense model + form, equal split, expense list. ✅ *(other methods pending UI)*
- **Phase 3 — Budgets & FX.** Monthly budget + progress view, scheduled FX Lambda, converted amounts. ✅
- **Phase 4 — Real-time & balances.** AppSync subscriptions, net balances. ✅
- **Phase 5 — Settlement & reports.** "Settle up" ✅; monthly summary, charts, CSV export ⬜.
- **Phase 6 — Polish.** Receipt uploads (S3), overspend notifications, empty states ⬜.

### 5. Cost

For an MVP or portfolio project this is effectively **near-free**: Cognito's
monthly-active-user allowance, DynamoDB on-demand, Lambda's free requests,
AppSync's free query allotment, and Amplify Hosting's free build minutes cover
light usage between them. You pay only as real traffic grows. *(Free-tier limits
and pricing shift — confirm current figures at aws.amazon.com/free before relying
on them.)*

### 6. Alternative Architecture (REST)

If a rubric mandates REST:

```
React (S3 + CloudFront)  →  API Gateway (REST)  →  Lambda  →  DynamoDB
                          with  Cognito  guarding the API
```

Same database and auth, but hand-written endpoints and handlers instead of the
managed GraphQL layer. More boilerplate, no built-in real-time (you'd add a
WebSocket API or polling), but maximal control.

### 7. Security & Good Practice

- Enforce per-group authorization at the data layer — never trust the client. ✅
- Keep FX API keys in Secrets Manager or Amplify environment variables, never in the frontend. ✅
- Validate and sanitise all inputs in Lambda. ✅
- Store money as integer minor units (cents) — never raw floats for currency. ✅
- Enable MFA in Cognito for account security. ⬜

---

*Free-tier and AWS pricing/service details evolve; verify current specifics on
AWS's own pages.*
