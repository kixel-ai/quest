# [M] High paths land only after a review

## Goal

A head `RISK.md` rates high, such as one changing the instructions under `assets/` every repository's agents load, lands only after a local review read it and on the maintainer's pick: no standing trivial pick, recorded trivial skip, or land fixer's mechanical fix stands in.

## Plan

Found 2026-11-23 by the review of [kixel-ai/quest#852](https://github.com/kixel-ai/quest/pull/852), which made all of `assets/` high and limited `RISK.md`'s `trivial` class, which `AGENTS.md`'s standing trivial pick defers to, to changes that are not high other than dependency and pin bumps.
The gaps predate it, since `assets/CONTEXT.md` was already high:

- `assets/skills/run.md` gives a trivial PR the standing pick "whatever its author and tier".
- `CONTRIBUTING.md` and `assets/skills/review.md` let a recorded skip of a trivial change count as the review, at any tier.
- `assets/skills/merge.md` exempts a land fixer's recorded mechanical fix from a new review, and the fixer's protected paths (`src/cli/land-fixer.ts`) cover only the build and CI files, so a conflict it resolves in an instruction file lands unread.

Recommended: each of the three excludes a high head, as the tier `quest review` records for it, other than a dependency or pin bump for the trivial pick; and the land fixer refuses to resolve a conflict in a `## High` path, leaving it to the PR's next `/quest-iterate`.

## Related

- [Ship the instructions audit](/quest/m0/instructions-audit.md) - its runs edit the instructions these gates protect
