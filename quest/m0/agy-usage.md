# [S] quest usage counts Antigravity reviewers' spend

## Goal

Once token-max reads Antigravity sessions, `quest usage` counts an `agy`
reviewer's spend toward its own seat and no other: a session a `## Review`
record names on an Antigravity seat goes to that seat, unnamed Antigravity
spend goes to the seats of its model, and Antigravity rows stop being marked
incomplete. Until then, Neon's spend stays off the Sol and Opus rows that
[reviewer rungs](/quest/m0/reviewer-rungs.md) retunes from.

## Plan

Found in [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838),
whose `share` in `src/cli/usage.ts` keeps every Antigravity seat out, named
or not, since token-max reads no Antigravity session today, and whose
`quest usage` marks an Antigravity reviewer's spend incomplete. Both are
right only while token-max reads none.

- Match a session to a seat by harness as well as model, using token-max's
  name for Antigravity sessions, so a gateway's session on a Gemini model
  stays off an Antigravity seat without the blanket exclusion.
- Remove the `read` exclusion in `share` and the `complete: false` mark on
  Antigravity rows, and flip `test/usage.test.ts`'s Antigravity rows: a named
  session goes to its seat, and a gateway's same-model session does not.
- If token-max reports Antigravity sessions unpriced, price them in
  `quest usage` at Google's API list price from the usage their stream
  reports, as the deleted Gemini reviewer quest recommended.

## Waiting

- kixel-ai/token-max: `token-max sessions` reads and prices `agy` sessions, which [kixel-ai/token-max#206](https://github.com/kixel-ai/token-max/pull/206) plans. Check that an `agy` review session shows there with a nonzero cost.

## Related

- [Reviewer rungs](/quest/m0/reviewer-rungs.md) - retunes from the per-model spend this keeps honest
