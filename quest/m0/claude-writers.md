# [M] Claude writes and fixes; Codex only reviews

## Goal

No writer list in `src/cli/models.ts` names a Codex model, so a quest whose
Claude writers cannot run waits for them instead of starting on Sol, and the
merge queue's land fixer (`quest land watch`, `src/cli/land-fix.ts`) runs
Claude Code through the host's model proxy instead of Codex, with the same
isolation, limit, and hand-back behavior. Codex, Gemini, and a Claude model
other than the writer's remain the reviewers.

Non-goals: the reviewer seats, which [review seats](/quest/m0/review-seats.md)
owns; the fixer in Kixel Quest's own merge queue, which retires `quest land`.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` follow-up of
[moq-dev/quest#826](https://github.com/moq-dev/quest/pull/826)):

- Which roles are Claude-only? ✅ Writers and the land fixer (rejected:
  writers only, keeping the Codex fixer; keep the Sol fallbacks). Every
  review then crosses vendor or model. Since 11-14 a Sol fallback wrote only
  a handful of XS and S PRs, and Astra 3 M PRs, so waiting costs little.
- DeepSeek as the fixer? ✅ No (rejected: decide it in kixel.quest's
  queue; a DeepSeek fixer here now). [moq-dev/quest#701](https://github.com/moq-dev/quest/pull/701)
  removed the opencode harness after its free DeepSeek quota ran out on
  11-13 and every review failed.

Guidance:

- `/quest-run` falls to a list's next entry only while nothing is written,
  so with one vendor left, a quest whose every writer is at its limit should
  stay unclaimed rather than claimed and stalled. Check how `quest agent`
  reports that (exit 3) and that the coordinator moves on.
- The fixer's container holds no credential beyond the host proxy's client
  key. Keep that for Claude Code: point `ANTHROPIC_BASE_URL` at the proxy
  rather than passing a login, and keep `--ignore-user-config`'s equivalent
  so neither the user's nor the checkout's Claude config loads. Read the
  model the run used from its own output, as the Codex banner reader does.

## Related

- [Writer table](https://github.com/moq-dev/quest/pull/829) - the lists this edits
