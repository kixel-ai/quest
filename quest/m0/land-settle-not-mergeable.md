# [S] The land gate waits out "not mergeable" after its own base push

## Goal

When `quest land`'s own queue pushes a base merge to a PR and GitHub answers
the merge with 405 "Pull Request is not mergeable" only because it is still
recomputing mergeability, the gate retries until that settles, within
`SETTLE_RETRIES`, and lands the PR without a re-queue. A refusal that
persists, such as a branch rule or a disabled merge method, still ejects it as
`merge_refused`. Non-goal: any change when the gate pushed nothing
(`previous === head`).

## Plan

Decided 2026-11-25 (maintainer, `/quest-plan` in kixel-ai/dotfiles's
`/quest-run`): ✅ plan it, with the goal above (rejected: drop it and
re-queue by hand).

Seen twice on 2026-11-25 in kixel-ai/dotfiles, which lands through this
gate's own serial queue:

- [kixel-ai/dotfiles#348](https://github.com/kixel-ai/dotfiles/pull/348)
- [kixel-ai/dotfiles#358](https://github.com/kixel-ai/dotfiles/pull/358):
  the gate's base merge `b0d5ede` was committed at 05:00:01Z, and the PR was
  ejected at 05:00:10Z with `GitHub refused /repos/kixel-ai/dotfiles/pulls/358:
  Pull Request is not mergeable`. Re-queueing the same head landed it.

`mergePinned` in `src/cli/land-head.ts` retries a refusal only when the PR
still shows the old head after the gate's push, when its mergeability is a
stale conflict after that push, when `mergeable` is `null`, or when the
message says the base branch was modified. A 405 whose PR already shows the
pushed head, with mergeability neither `null` nor a conflict, falls through
to `merge_refused`. The PR is read after the refused merge, so it can show
mergeability GitHub settled after refusing it.

Recommended, for the implementer to confirm:

- After the gate's own push (`previous !== head`), treat a 405 whose PR shows
  `head`, and no conflict, as still settling, whatever its `mergeable_state`:
  the read follows the refusal, so it can already show `clean`. Retry it
  under the existing `SETTLE_RETRIES` backoff (about 15 s in all). When the
  retries run out, eject it as `merge_refused`, not throw as the other
  settling branches do: a refusal that lasts, such as a disabled merge
  method, is real, and a throw would retry it every round. A conflicting PR
  after the push keeps today's path (wait, then throw so the next round
  rebuilds on the moved base), since only a base that moved can conflict.
- Put `mergeable` and `mergeable_state` in the ejection's detail, so the next
  refusal shows what GitHub reported. Neither refusal tonight recorded it.
- Test with a mocked GitHub that answers 405 for one or two rounds after the
  gate's push and then merges. A 405 that persists past the retries still
  ejects as `merge_refused`, and so does one with no gate push and settled,
  non-conflicting mergeability. A 405 conflict after the push still throws
  `mergeability did not settle`, and with no push, `mergeable: null` still
  retries as today.
