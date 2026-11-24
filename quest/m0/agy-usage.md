# [S] quest usage counts Antigravity reviewers' spend

## Goal

Once token-max reads Antigravity sessions, `quest usage` counts an `agy`
reviewer's spend toward its own seat and no other: a session a `## Review`
record names on an Antigravity seat goes to that seat, unnamed Antigravity
spend goes to the seats of its model, and Antigravity rows stop being marked
incomplete. Until then, Neon's spend stays off the Sol and Opus rows that
`quest review`'s rungs are retuned from.

## Plan

Found in [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838),
whose `share` in `src/cli/usage.ts` keeps every Antigravity seat out, named
or not, since token-max reads no Antigravity session today, and whose
`quest usage` marks an Antigravity reviewer's spend incomplete. Both are
right only while token-max reads none.

- Bring Antigravity sessions into the PR's rows. A review turn runs in a
  temporary workspace outside the checkout, so token-max may report no
  repository or branch for it: attach such a session to the PR whose
  `## Review` record names its ID, which lists every session of each
  reviewer's rounds on the branch. Teach `transcriptFacts` in
  `src/cli/transcript.ts` token-max's Antigravity harness, which it throws
  on today.
- Match a session to a seat by harness as well as model, using token-max's
  name for Antigravity sessions, so a gateway's session on a Gemini model
  stays off an Antigravity seat without the blanket exclusion. Keep `share`'s
  fallback for spend no seat's model matches within the session's harness, so
  unmatched Antigravity spend goes to an Antigravity seat, never to an Opus or
  Sol one, and stays uncounted where the PR has none.
- Remove the `read` exclusion in `share` and the `complete: false` mark on
  Antigravity rows, and flip `test/usage.test.ts`'s Antigravity rows: a named
  session goes to its seat, and a gateway's same-model session does not.
- If token-max reports Antigravity sessions unpriced, price them in
  `quest usage` at Google's API list price from the usage their stream
  reports, as the deleted Gemini reviewer quest recommended.

## Waiting

- kixel-ai/token-max: `token-max sessions` reads `agy` sessions, priced or not, which [kixel-ai/token-max#206](https://github.com/kixel-ai/token-max/pull/206) plans. Check that an `agy` review session shows there with its session ID and usage.
