import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { createGroupFn } from '../functions/create-group/resource';
import { joinGroupFn } from '../functions/join-group/resource';
import { fxRefreshFn } from '../functions/fx-refresh/resource';

/**
 * Cagnotte data model.
 *
 * Authorization model
 * -------------------
 * Every row that belongs to a Cagnotte group carries a `groupKey` — the name of
 * a Cognito user-pool group created alongside it (`grp_<uuid>`). Access is then
 * enforced by AppSync against the caller's ID token via `allow.groupDefinedIn`,
 * so a user can only ever read or write rows for groups they are a member of.
 *
 * Membership is granted by two Lambdas (`createGroup`, `joinGroup`) which hold
 * the only permission to add a user to a Cognito group. Clients cannot mint
 * membership themselves, and no client-side filtering is trusted.
 *
 * Money
 * -----
 * All amounts are integers in *minor units* (cents, yen, etc.) — never floats.
 * See `src/lib/money.ts` for the conversion helpers.
 */
const schema = a
  .schema({
    /** A shared pot: a trip, a flatshare, a semester abroad. */
    Group: a
      .model({
        name: a.string().required(),
        /** ISO-4217 code every amount is reported in, e.g. "SGD". */
        baseCurrency: a.string().required(),
        /** Cognito group name backing this group's authorization. */
        groupKey: a.string().required(),
        /** Short human-shareable code used to join, e.g. "7KQ4-B2XM". */
        inviteCode: a.string().required(),
        createdBy: a.string().required(),
        memberships: a.hasMany('Membership', 'groupId'),
        expenses: a.hasMany('Expense', 'groupId'),
        budgets: a.hasMany('Budget', 'groupId'),
      })
      .secondaryIndexes((index) => [index('inviteCode')])
      .authorization((allow) => [allow.groupDefinedIn('groupKey').to(['read', 'update'])]),

    /** Links a Cognito user to a Group. Created only by the join/create Lambdas. */
    Membership: a
      .model({
        groupId: a.id().required(),
        group: a.belongsTo('Group', 'groupId'),
        groupKey: a.string().required(),
        /** Cognito `sub` of the member. */
        userId: a.string().required(),
        displayName: a.string().required(),
        email: a.string(),
        role: a.enum(['OWNER', 'MEMBER']),
      })
      .secondaryIndexes((index) => [index('groupId'), index('userId')])
      .authorization((allow) => [allow.groupDefinedIn('groupKey').to(['read'])]),

    /**
     * One payment made by one member. The original amount and currency are kept
     * verbatim forever; `amountInBase` and `fxRateUsed` record the conversion at
     * the time it was logged, so history never shifts when rates move.
     */
    Expense: a
      .model({
        groupId: a.id().required(),
        group: a.belongsTo('Group', 'groupId'),
        groupKey: a.string().required(),
        /** Cognito `sub` of whoever actually paid. */
        payerId: a.string().required(),
        description: a.string().required(),
        category: a.enum([
          'FOOD',
          'GROCERIES',
          'RENT',
          'TRANSPORT',
          'UTILITIES',
          'ENTERTAINMENT',
          'TRAVEL',
          'OTHER',
        ]),
        /** Minor units in `currencyOriginal`. */
        amountOriginal: a.integer().required(),
        currencyOriginal: a.string().required(),
        /** Minor units in the group's base currency. */
        amountInBase: a.integer().required(),
        fxRateUsed: a.float().required(),
        /** ISO date, `YYYY-MM-DD`. Sort key for the by-group index. */
        date: a.string().required(),
        note: a.string(),
        splits: a.hasMany('Split', 'expenseId'),
      })
      .secondaryIndexes((index) => [index('groupId').sortKeys(['date'])])
      .authorization((allow) => [allow.groupDefinedIn('groupKey')]),

    /** What one member owes for one expense, in the group's base currency. */
    Split: a
      .model({
        expenseId: a.id().required(),
        expense: a.belongsTo('Expense', 'expenseId'),
        groupId: a.id().required(),
        groupKey: a.string().required(),
        userId: a.string().required(),
        /** Minor units in the group's base currency. */
        shareAmount: a.integer().required(),
      })
      .secondaryIndexes((index) => [index('groupId'), index('expenseId')])
      .authorization((allow) => [allow.groupDefinedIn('groupKey')]),

    /** A spending limit for one group, one month. MVP: whole-group only. */
    Budget: a
      .model({
        groupId: a.id().required(),
        group: a.belongsTo('Group', 'groupId'),
        groupKey: a.string().required(),
        /** `YYYY-MM`. */
        month: a.string().required(),
        /** Minor units in the group's base currency. */
        limitInBase: a.integer().required(),
      })
      .secondaryIndexes((index) => [index('groupId').sortKeys(['month'])])
      .authorization((allow) => [allow.groupDefinedIn('groupKey')]),

    /**
     * Cached FX rates, refreshed daily by `fxRefreshFn`. Everything is stored
     * against USD; cross-rates are derived in `src/lib/fx.ts`.
     */
    Rate: a
      .model({
        base: a.string().required(),
        quote: a.string().required(),
        /** How many `quote` units one `base` unit buys. */
        rate: a.float().required(),
        fetchedAt: a.datetime().required(),
      })
      .identifier(['base', 'quote'])
      .authorization((allow) => [allow.authenticated().to(['read'])]),

    /** Creates the Cognito group, the Group row, and the owner's Membership. */
    createGroup: a
      .mutation()
      .arguments({
        name: a.string().required(),
        baseCurrency: a.string().required(),
        displayName: a.string().required(),
      })
      .returns(a.ref('GroupActionResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(createGroupFn)),

    /** Redeems an invite code: adds the caller to the Cognito group. */
    joinGroup: a
      .mutation()
      .arguments({
        inviteCode: a.string().required(),
        displayName: a.string().required(),
      })
      .returns(a.ref('GroupActionResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(joinGroupFn)),

    GroupActionResult: a.customType({
      groupId: a.string().required(),
      groupKey: a.string().required(),
      inviteCode: a.string().required(),
      name: a.string().required(),
      baseCurrency: a.string().required(),
    }),
  })
  // Schema-level resource rules are how a Lambda gets IAM access to the data
  // API — `allow.resource` is not available per model. These three functions are
  // the only non-user principals that can touch Cagnotte's tables.
  .authorization((allow) => [
    allow.resource(createGroupFn).to(['query', 'mutate']),
    allow.resource(joinGroupFn).to(['query', 'mutate']),
    allow.resource(fxRefreshFn).to(['query', 'mutate']),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
