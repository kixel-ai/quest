# [M] Reviewers trace a changed contract to its dependents

## Goal

`quest review`'s reviewers find more of the escapes where a change altered
a contract (a signature, a key's meaning, a default, a format, a guard, a
documented behavior) and left a dependent on the old one: a caller, a
consumer, a sibling implementation or path, a parallel registry, a test, a
bench, or the docs. `quest eval run` shows the gain on a set holding that
class, at no more clean-PR noise.

## Plan

From the 2026-11-18 [mistake audit](/quest/m0/mistake-audit.md) run: this
was the largest class of real escapes, about 41 of 204 across moq-dev/moq,
moq-dev/moq.pro, and moq-dev/quest. 26 of them were catchable or maybe from
the culprit's diff, and each had passed a local review. Neither the review
prompts in `src/cli/review.ts` nor a `REVIEW.md` asks a reviewer to look
past the diff for what depends on what it changed. A type check already
catches the callers a compiler sees, so what remains is semantic, which
leaves a reviewer instruction as the highest level that holds.

Recommended:

- Build the cases first. Add this class's catchable and maybe escapes to
  an eval set with `quest eval add`, each defect located at the culprit's
  head from the fix's diff. moq-dev/quest's own set holds two
  ([moq-dev/quest#186](https://github.com/moq-dev/quest/pull/186) fixed by
  [moq-dev/quest#632](https://github.com/moq-dev/quest/pull/632), and
  [moq-dev/quest#585](https://github.com/moq-dev/quest/pull/585) fixed by
  [moq-dev/quest#685](https://github.com/moq-dev/quest/pull/685)). For
  moq-dev/moq, build a set in a clone with `--set` rather than waiting on
  a PR there. Its pairs (culprit then fix) are 8541/8580, 8618/8817,
  7943/8920, 5003/8920, 6177/8927, 8956/9013, 7656/9023, 5283/9047,
  8896/9048, 7706/9060, 8596/9065, 2547/9116, 7844/8529, and 8561/8602.
  Add clean PRs from the same weeks so noise is measured too.
- Then change the review prompt: ask the reviewer to name each contract
  the diff changes and to search the repository for that contract's
  dependents, reporting one it left on the old contract. Keep it a short
  addition to the existing prompt, not a checklist.
- Score base and head builds with `quest eval run` on both sets, and put
  both scores and their cost in the PR's `## Validation`, as this
  repository's `AGENTS.md` requires for a review-prompt change. Land it
  only if defects found rise without clean findings rising more.

## Related

- [Routing evidence](/quest/m0/routing-evidence/README.md) - the escape
  baseline reviewers are scored against
