# [S] /quest-run releases a claim its writers' limits stranded

## Goal

When `/quest-run` skips a quest because every entry of its `models` stopped on
a usage limit with nothing written beyond the claim commit, the quest goes back
to unclaimed, so a later round, or another coordinator, starts it once a writer
can run instead of leaving a draft PR that `quest unblocked --unclaimed` hides.

## Plan

Maintainer, 2026-11-22: ✅ keep (rejected: drop).

Since Codex no longer writes, most sizes list one writer, so a limit that hits
after the agent's `quest start` pushed its claim now ends the list at once.
`quest agent` already reports the stop as `limited` (exit 3); a limit that
rejects the agent's first request leaves no claim, so only a limit mid-run
strands one.

- `assets/skills/run.md`'s "Skip a quest whose list runs out" releases the
  claim with `quest start --release <quest>` from the agent's checkout when
  nothing beyond the claim commit was pushed, then skips it as before.
- A PR with work on it stays its writer's, resumed after the reset as the skill
  already says.

## Related

- [moq-dev/quest#832](https://github.com/moq-dev/quest/pull/832) - drops the
  Codex writer fallbacks that made this rare
