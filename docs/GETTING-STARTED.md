# Getting Cagnotte running — GitHub, AWS, and what to do next

Everything below assumes the code in this repository. Steps 1–4 get you a
working app on your own machine against a real AWS backend; step 5 puts it on
the internet; step 6 is the roadmap past the MVP.

---

## 1. What you need before you start

| | |
|---|---|
| **Node.js** | 18 or newer (`node --version`) |
| **An AWS account** | The free tier covers development comfortably |
| **AWS credentials on your machine** | See step 2 |
| **A GitHub repo** | You have one — this is it |

There is nothing to pay for up front. Amplify sandbox deployments use on-demand
DynamoDB, Lambda, and Cognito, all of which sit inside the free tier at
development volumes.

---

## 2. Give your machine AWS credentials

This is the step people get stuck on, so do it first and confirm it works.

```bash
npm install -g @aws-amplify/cli   # optional, but `ampx` below comes from the repo
npx ampx configure profile
```

That walks you through creating an IAM Identity Center user with the right
permissions and writes a local profile. Confirm it worked:

```bash
aws sts get-caller-identity        # if you have the AWS CLI
```

If you prefer the older route, `aws configure` with an IAM user's access keys
works too — just give it `AdministratorAccess` on a personal dev account, not on
anything shared.

---

## 3. Start your personal cloud backend

```bash
npm install
npx ampx sandbox
```

The first run takes a few minutes. It deploys, into *your* AWS account, a
personal stack containing:

- a **Cognito user pool** (sign-in),
- an **AppSync GraphQL API** with subscriptions,
- **DynamoDB tables** for Group, Membership, Expense, Split, Budget, Rate,
- three **Lambdas** (`create-group`, `join-group`, `fx-refresh`),
- an **EventBridge rule** that runs the FX refresh daily.

It then writes `amplify_outputs.json` — the file that points the frontend at all
of the above. **Leave `ampx sandbox` running**; it watches `amplify/` and
redeploys as you edit.

> The sandbox is yours alone and disposable. `npx ampx sandbox delete` removes
> every resource it created.

### Seed the exchange rates

The FX table is empty until the daily schedule first fires. Invoke it once by
hand so conversions work immediately — find the function name in the sandbox
output, then:

```bash
aws lambda invoke --function-name <fx-refresh-function-name> /dev/stdout
```

Until rates exist, expenses logged **in the group's base currency** still work
fine; only cross-currency ones will ask you to wait.

---

## 4. Run the app

In a second terminal:

```bash
npm run dev
```

Open <http://localhost:3000>, create an account, and walk the MVP story:

1. Create a group, base currency EUR.
2. Copy the invite code, open a private window, sign up as a second user, join
   with that code.
3. Add an expense in GBP as user A — watch it appear in user B's window without
   a refresh.
4. Set a monthly budget and watch the bar move.
5. Check "Settle up" says something sensible.

If step 3 doesn't update live, check the browser console: the subscription is
the first thing to break behind a corporate proxy.

### The checks

```bash
npm test              # domain logic: money, splits, FX, balances, settlement
npm run typecheck     # frontend + shared code
npm run typecheck:backend   # amplify/ — the same check ampx runs before deploying
npm run build         # production build
```

---

## 5. Deploy it

1. Push this branch and merge it to `main`.
2. In the **AWS Amplify Console** → *Create new app* → *GitHub*, authorise AWS
   and pick this repository and branch.
3. Amplify detects `amplify.yml` in the repo root and uses it: it deploys the
   backend with `ampx pipeline-deploy`, then builds the Next.js frontend.
4. First build takes ~10 minutes. You get a `https://main.<id>.amplifyapp.com`
   URL, and every push to that branch redeploys automatically.

The production backend is a *separate* stack from your sandbox — separate user
pool, separate tables. Accounts and data do not carry over.

---

## 6. Where to go after the MVP

Roughly in order of value-per-hour. Each is independently shippable.

**a. Make expense + splits atomic.** Today the client writes the `Expense` row
then the `Split` rows; a failure between them leaves an expense missing from
balances. Move both into an `addExpense` Lambda so it's one operation. This is
the only correctness gap in the MVP and it's the natural next commit.

**b. The other three split methods.** `splitByWeights` and `splitExact` in
`src/lib/splits.ts` are already written and tested — this is a UI task: a
method picker, per-member inputs, and validation. Cheap, and it's the feature
that most distinguishes Cagnotte from a plain budget app.

**c. Edit and delete expenses.** Currently expenses are append-only. Deleting
needs to remove the splits too — another reason to have (a) in place first.

**d. Receipt photos.** Add Amplify Storage (S3), a file input on the expense
form, and `receiptKey` on the Expense model. Access-control the bucket by the
same `groupKey` idea.

**e. Overspend notifications.** A Lambda on the Expense stream that recomputes
the month's total and publishes to SNS when it crosses 85% and 100%. This is
where the "You've used 85% of March's budget" feature lands.

**f. Per-category budgets.** The Budget model already has room for a `category`
field — add it, default `ALL`, and group the progress view by category.

**g. Reports.** Monthly totals by category, a simple trend chart, CSV export.
Pure frontend work over data you already have.

**h. Polish for the demo.** Empty states, loading skeletons, a proper invite
*link* (not just a code), and MFA in Cognito.

If you're doing this for a course or a portfolio, (a), (b), (d) and (e) give the
broadest coverage of the stack — atomic transactions, real domain logic, S3, and
event-driven notifications — for the least work.
