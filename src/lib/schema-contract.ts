import type { Client } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

/**
 * Compile-time guards on the query names Amplify generates from
 * `secondaryIndexes` in `amplify/data/resource.ts`.
 *
 * The Lambda handlers call these by name, but they live outside the frontend
 * typecheck (they import `$amplify/env/*`, which only exists after a deploy).
 * A rename or a dropped index would otherwise surface as a runtime failure in
 * production rather than a red build. Indexing a type with a key it doesn't
 * have is an error, so these aliases fail the typecheck if the contract breaks.
 */
type Models = Client<Schema>['models'];

/** `join-group/handler.ts` — looks a group up by its invite code. */
export type GroupByInviteCode = Models['Group']['listGroupByInviteCode'];

/** `join-group/handler.ts` — checks whether the caller is already a member. */
export type MembershipByUserId = Models['Membership']['listMembershipByUserId'];

/** Used by the group view to list a group's members. */
export type MembershipByGroupId = Models['Membership']['listMembershipByGroupId'];

/** Reserved for the expense history view once it pages by date. */
export type ExpenseByGroupAndDate = Models['Expense']['listExpenseByGroupIdAndDate'];

/** Reserved for the budget lookup once it queries the index directly. */
export type BudgetByGroupAndMonth = Models['Budget']['listBudgetByGroupIdAndMonth'];
