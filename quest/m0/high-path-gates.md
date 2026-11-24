# [M] High paths land only after a review

## Goal

A head `RISK.md` rates high, such as one changing the instructions under `assets/` every repository's agents load, lands only after a local review read it and on the maintainer's pick: no standing trivial pick or land fixer's mechanical fix stands in, and no agent skips a review as too trivial.

## Plan

Found 2026-11-23 by the review of [kixel-ai/quest#852](https://github.com/kixel-ai/quest/pull/852), which made all of `assets/` high and limited `RISK.md`'s `chore` class, then named `trivial`, which `AGENTS.md`'s standing trivial pick defers to, to changes that are not high other than dependency and pin bumps.
The gaps predate it, since `assets/CONTEXT.md` was already high:

- `assets/skills/run.md` gives a trivial PR the standing pick "whatever its author and tier", though since [kixel-ai/quest#868](https://github.com/kixel-ai/quest/pull/868) only once a maintainer's local reviewer's round passes on its head.
- `assets/skills/merge.md` exempts a land fixer's recorded mechanical fix from a new review, and the fixer's protected paths (`src/cli/land-fixer.ts`) cover only the build and CI files, so a conflict it resolves in an instruction file lands unread.

Decided 2026-11-23 (maintainer, the pick round of [kixel-ai/quest#852](https://github.com/kixel-ai/quest/pull/852)): ✅ keep this quest, and "remove the too trivial to review line": delete the recorded trivial skip from `CONTRIBUTING.md` and `/quest-review`, so the tier alone decides when no local review runs, as `low` already does, keeping three tiers (rejected: a `none` tier below `low` with no online review either; leaving the skip). [kixel-ai/quest#868](https://github.com/kixel-ai/quest/pull/868) deleted it, with the rest of the recorded skips.

Recommended for the other two: the standing trivial pick excludes a high head other than a dependency or pin bump, as the tier `quest review` records for it; and the land fixer refuses to resolve a conflict in a `## High` path, leaving it to the PR's next `/quest-iterate`.

## Related

- [Ship the instructions audit](/quest/m0/instructions-audit.md) - its runs edit the instructions these gates protect
