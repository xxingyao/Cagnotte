# Cagnotte 💶

> A shared budget & expense tracker for people abroad together — multi-currency, monthly budgets, and real-time balances for your group.

*Cagnotte* (French for the shared "kitty") lets travel companions, expat flatmates, and friends overseas pool their spending across currencies, track it against a monthly budget, and see who owes whom — live, for every member of the group.

---

## ✨ Features

- 🔐 **Accounts** — secure email sign-up / sign-in (Amazon Cognito)
- 👥 **Groups** — create a group, set a base currency, invite members by link
- 🧾 **Expenses** — log spending in any currency; split equally among members
- 💱 **Multi-currency** — automatic conversion to the group's base currency, with the original preserved
- 📅 **Monthly budget** — set a limit per group per month and watch progress
- ⚖️ **Balances** — see per-member net balances and who owes whom
- ⚡ **Real-time** — expenses and balances update live across all devices

*See [`cagnotte-mvp-description.md`](./cagnotte-mvp-description.md) for the exact MVP scope and [the project plan](./cagnotte-budget-tracker-synopsis-and-aws-plan.md) for the full roadmap.*

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Next.js, TypeScript, Tailwind CSS |
| Auth | Amazon Cognito (via AWS Amplify) |
| API | AWS AppSync (GraphQL) with real-time subscriptions |
| Database | Amazon DynamoDB |
| Business logic | AWS Lambda (splitting, settlement, FX refresh) |
| Scheduling | Amazon EventBridge (daily FX rate pull) |
| File storage | Amazon S3 (receipts — post-MVP) |
| Hosting / CI-CD | AWS Amplify Hosting |
| Backend framework | **AWS Amplify Gen 2** (TypeScript, on AWS CDK) |

---

## 🧱 Architecture

```
 React / Next.js (Amplify Hosting)
        │  GraphQL (queries · mutations · subscriptions)
        ▼
 AWS AppSync ──── guarded by Amazon Cognito
   │        │            │
   ▼        ▼            ▼
 DynamoDB  Lambda      Lambda (FX refresh)
 (data)    (logic)     ◄── EventBridge (daily)  ◄── external FX API
```

---

## 📁 Project Structure

```
cagnotte/
├── amplify/                 # Amplify Gen 2 backend (TypeScript)
│   ├── auth/resource.ts     # Cognito configuration
│   ├── data/resource.ts     # Data models + authorization rules
│   ├── functions/           # Lambda functions (splitting, FX refresh)
│   └── backend.ts           # Backend definition entry point
├── app/ (or src/)           # Next.js frontend
│   ├── components/
│   ├── lib/                 # Amplify client, currency helpers
│   └── ...
├── amplify_outputs.json     # Generated — connects frontend to backend
├── package.json
└── README.md
```

---

## 🗃️ Data Models

Defined in `amplify/data/resource.ts` and provisioned automatically as DynamoDB tables via AppSync.

| Model | Key fields |
|---|---|
| **User** | id, name, email, defaultCurrency |
| **Group** | id, name, baseCurrency, createdBy |
| **Membership** | userId, groupId, role |
| **Expense** | id, groupId, payerId, amountOriginal, currencyOriginal, amountInBase, fxRateUsed, category, date, note |
| **Split** | id, expenseId, userId, shareAmount |
| **Budget** | id, groupId, month (`YYYY-MM`), limitInBase |
| **Rate** | currencyPair, rate, fetchedAt |

> **Authorization:** group data is readable only by its members, enforced declaratively with Cognito owner/group rules in the schema.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ and npm
- An **AWS account** ([free tier](https://aws.amazon.com/free) is plenty for development)
- AWS credentials configured locally (`aws configure` or an IAM Identity Center profile)

### 1. Clone & install
```bash
git clone https://github.com/<your-username>/cagnotte.git
cd cagnotte
npm install
```

### 2. Start the Amplify sandbox
This spins up a personal, isolated cloud backend for development and generates `amplify_outputs.json`:
```bash
npx ampx sandbox
```
Leave it running — it watches `amplify/` and redeploys on change.

### 3. Run the frontend
In a second terminal:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 4. Configure the FX rate source
Add your exchange-rate API key as a backend secret (never in frontend code):
```bash
npx ampx sandbox secret set FX_API_KEY
```

---

## ☁️ Deployment

Deploy production by connecting this repository in the **AWS Amplify Console**:

1. Push your code to GitHub.
2. In the Amplify Console, **Create app → connect repository**, and select the branch.
3. Amplify builds the backend and frontend and gives you a hosted URL. Every push to the branch redeploys automatically.

---

## 🗺️ Roadmap

- [x] Project scaffold (Amplify Gen 2 + Next.js)
- [ ] **MVP:** auth, groups, equal-split expenses, FX conversion, monthly budget, balances, real-time
- [ ] Additional split methods (shares, %, exact)
- [ ] Minimised settlement ("fewest payments") algorithm
- [ ] Receipt uploads (S3)
- [ ] Budget alerts & notifications
- [ ] Analytics, charts, and CSV export

---

## 🔒 Security Notes
- Money is stored as integer minor units (cents) — never as floats.
- API keys live in AWS Secrets Manager / Amplify secrets, never in the client.
- All group access is authorized at the data layer.

---

## 📄 License
_Choose a license (e.g. MIT) and add it here._

---

*Built on AWS Amplify Gen 2. Free-tier limits and AWS pricing change — verify current figures on AWS's own pages.*
