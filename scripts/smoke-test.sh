#!/usr/bin/env bash
# Cagnotte API smoke test.
#
# Tier 1 needs nothing — it just confirms every protected route refuses an
# unauthenticated caller uniformly. Run it any time, zero setup.
#
# Tier 2 needs a real signed-in token (CAGNOTTE_TOKEN) and actually exercises
# create -> read -> update -> delete against live data, checking the shape of
# every response. This is the tier that would have caught today's stale-code
# bugs — Tier 1 alone can't, since a broken Lambda still correctly says 401
# to a caller with no token at all.
set -o pipefail

BASE="${CAGNOTTE_API_BASE:-https://oxfhpuu8a8.execute-api.us-east-1.amazonaws.com/dev}"
TOKEN="${CAGNOTTE_TOKEN:-}"

PASS=0
FAIL=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf "  \033[32m✓\033[0m %-52s (got %s)\n" "$desc" "$actual"
    PASS=$((PASS + 1))
  else
    printf "  \033[31m✗\033[0m %-52s (expected %s, got %s)\n" "$desc" "$expected" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

status() { curl -s -o /dev/null -m 15 -w "%{http_code}" "$@"; }

extract() { echo "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | sed 's/.*:"\(.*\)"/\1/'; }
extract_num() { echo "$1" | grep -o "\"$2\":[0-9]*" | head -1 | sed 's/.*://'; }
count_key() { echo "$1" | grep -o "\"$2\":" | wc -l | tr -d ' '; }

echo "== Tier 1: unauthenticated — every protected route should refuse cleanly =="
echo

check "POST /groups, no token"                 401 "$(status -X POST "$BASE/groups" -d '{}')"
check "GET  /me/groups, no token"               401 "$(status "$BASE/me/groups")"
check "GET  /groups/x, no token"                401 "$(status "$BASE/groups/x")"
check "GET  /groups/x/expenses, no token"       401 "$(status "$BASE/groups/x/expenses")"
check "POST /expenses, no token"                401 "$(status -X POST "$BASE/expenses" -d '{}')"
check "DELETE /groups/x/expenses/y, no token"   401 "$(status -X DELETE "$BASE/groups/x/expenses/y")"
check "POST /groups/x/members, no token"        401 "$(status -X POST "$BASE/groups/x/members" -d '{}')"
check "GET  /invites/AAAA-BBBB, no token"       401 "$(status "$BASE/invites/AAAA-BBBB")"
check "GET  /groups/x/budgets, no token"        401 "$(status "$BASE/groups/x/budgets")"
check "POST /groups/x/budgets, no token"        401 "$(status -X POST "$BASE/groups/x/budgets" -d '{}')"
check "GET  /groups/x, garbage token"           401 "$(status "$BASE/groups/x" -H "Authorization: not-a-real-token")"

echo

if [ -z "$TOKEN" ]; then
  echo "== Tier 2 skipped — no CAGNOTTE_TOKEN set =="
  echo "   Get one from the browser console while signed in to the app:"
  echo "   JSON.parse(localStorage.getItem('cagnotte.tokens')).idToken"
  echo "   Then: CAGNOTTE_TOKEN=\"eyJraWQiOiJTVGhhL2VjSVgzY0FhR1FZbXV6TENkV0ZNOUM1SXl0ZUNkNW5lbkJkNGlvPSIsImFsZyI6IlJTMjU2In0.eyJhdF9oYXNoIjoiZC1nU3JFS19kazF4RGtkdVVWS2F1USIsInN1YiI6Ijc0ZjgyNDI4LWEwODEtNzBjOC00YjBmLWMyY2FjYzAwOTM1YyIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczovL2NvZ25pdG8taWRwLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tL3VzLWVhc3QtMV92Vzd4QUxvVm4iLCJjb2duaXRvOnVzZXJuYW1lIjoiNzRmODI0MjgtYTA4MS03MGM4LTRiMGYtYzJjYWNjMDA5MzVjIiwib3JpZ2luX2p0aSI6IjE1YjM4NjdlLTQ1YTktNDA2OC05MTg1LTUxNzY5NTdiMDg2OCIsImF1ZCI6IjNodXI4NzllajczZDRvM242aG1hdXVwc2xoIiwiZXZlbnRfaWQiOiJlZTVjNWEzYy1mMWY1LTQ5ZjgtYjA0Zi1hMjYwYWIzMzIyMzciLCJ0b2tlbl91c2UiOiJpZCIsImF1dGhfdGltZSI6MTc4NjUxOTYzNywibmFtZSI6IlhpbmcgWWFvIiwiZXhwIjoxNzg2NTMwOTk0LCJpYXQiOjE3ODY1MjczOTQsImp0aSI6ImViMzkyMzZmLTU1Y2QtNDUzZi1iZTU0LTg0ZjdkZGM4ZWI1YyIsImVtYWlsIjoibGF1eGluZ3lhbzQxODhAZ21haWwuY29tIn0.Mkph3xUsqyP3tXv_rXgNpVoEzQdj4wfJ0nJBv7jcEa5l6iyg2HfQSOQnav1lsVjROBktnspRMEDtuNMuHx3WKk-FV_U6zyUzVvD84jvdFQjGtS9K8wAhhbUaD54y0Kfw1LujRQextAoFbpkwO5hJp36NUvC1UJHuBzCvtjtGK-oAlmXpTCTdS6gHbEA9J8vbtw2oYiljdbj0jOHAajFrEmO3xdhbAqmck8R4yslYyuoUUFhmBYIhnImw20i3ZCNC8oq8YgLaaXJ9Zq2gGUroggX1yn6DCkWWUKeSrvELU1Rjh7ZTeWABViDdaj-zKghWyUMutj8IIcgrKdwIWAvBEQ\" ./smoke-test.sh"
else
  echo "== Tier 2: authenticated end-to-end pass =="
  echo

  CREATE=$(curl -s -m 15 -X POST "$BASE/groups" -H "Authorization: $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"smoke-test","baseCurrency":"EUR","yourName":"smoke"}')
  GROUP_ID=$(extract "$CREATE" groupId)
  INVITE=$(extract "$CREATE" inviteCode)

  if [ -z "$GROUP_ID" ] || [ -z "$INVITE" ]; then
    echo "  ✗ createGroup — expected groupId + inviteCode, got: $CREATE"
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ createGroup → $GROUP_ID"
    PASS=$((PASS + 1))

    GROUP=$(curl -s -m 15 "$BASE/groups/$GROUP_ID" -H "Authorization: $TOKEN")
    MEMBER_ID=$(extract "$GROUP" id)
    check "getGroup has exactly 1 member" 1 "$(count_key "$GROUP" id)"

    ADD=$(curl -s -m 15 -X POST "$BASE/expenses" -H "Authorization: $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"groupId\":\"$GROUP_ID\",\"description\":\"smoke\",\"payerId\":\"$MEMBER_ID\",\"amount\":1000,\"currency\":\"EUR\",\"category\":\"Other\",\"date\":\"2026-01-01\",\"splitBetween\":[\"$MEMBER_ID\"]}")
    EXPENSE_ID=$(extract "$ADD" expenseId)
    if [ -z "$EXPENSE_ID" ]; then
      echo "  ✗ addExpense — expected expenseId, got: $ADD"
      FAIL=$((FAIL + 1))
    else
      echo "  ✓ addExpense → $EXPENSE_ID"
      PASS=$((PASS + 1))
    fi

    LIST=$(curl -s -m 15 "$BASE/groups/$GROUP_ID/expenses" -H "Authorization: $TOKEN")
    check "getExpenses returns exactly 1 row" 1 "$(count_key "$LIST" expenseId)"

    SET_BUDGET=$(curl -s -m 15 -X POST "$BASE/groups/$GROUP_ID/budgets" -H "Authorization: $TOKEN" \
      -H "Content-Type: application/json" -d '{"month":"2026-01","limitMinor":50000}')
    check "setBudget echoes limitMinor" 50000 "$(extract_num "$SET_BUDGET" limitMinor)"

    GET_BUDGETS=$(curl -s -m 15 "$BASE/groups/$GROUP_ID/budgets" -H "Authorization: $TOKEN")
    check "getBudgets returns exactly 1 row" 1 "$(count_key "$GET_BUDGETS" month)"

    REJOIN=$(curl -s -m 15 -X POST "$BASE/groups/$GROUP_ID/members" -H "Authorization: $TOKEN" \
      -H "Content-Type: application/json" -d '{"name":"smoke again"}')
    check "re-joining your own group doesn't duplicate you" 1 "$(count_key "$REJOIN" id)"

    curl -s -m 15 -X DELETE "$BASE/groups/$GROUP_ID/expenses/$EXPENSE_ID" -H "Authorization: $TOKEN" > /dev/null
    LIST_AFTER=$(curl -s -m 15 "$BASE/groups/$GROUP_ID/expenses" -H "Authorization: $TOKEN")
    check "deleteExpense actually removed it" 0 "$(count_key "$LIST_AFTER" expenseId)"

    echo
    echo "  Note: the \"smoke-test\" group itself is left behind (no deleteGroup"
    echo "  endpoint exists) — safe to ignore, or delete it from DynamoDB now and then."
  fi
fi

echo
echo "======================================"
echo "  $PASS passed, $FAIL failed"
echo "======================================"
[ "$FAIL" -eq 0 ]
