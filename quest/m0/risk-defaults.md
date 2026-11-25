# [S] Built-in risk defaults every repository gets

## Goal

`quest review` classifies a change against built-in defaults that hold in
every repository, whether or not it has a `RISK.md`:

- an automatic class `quest`, scoped to `quest/**`, for a diff that only
  changes plans, so a repository with no `RISK.md` is offered it for a
  plan-only PR instead of classing every change medium;
- `.github/workflows/` and `.github/actions/` held high, beside `RISK.md`
  itself.

A repository's `RISK.md` still adds its own classes and `## High` paths.
Repository-specific scopes, such as `test` or `scripts/*`, stay in each
repository's own file and are not defaults: `scripts` is too generic.

## Plan

Decided 2026-11-25 (maintainer, /quest-run): what quest ships as built-in
risk defaults.

- ✅ Both: the `quest` class scoped to `quest/**` as a default class, since
  every quest repository has the same tree, and `.github/workflows/` and
  `.github/actions/` added to `ALWAYS_HIGH` in `src/core/risk.ts`, because
  PR workflows on quest branches run with the repository's secrets
- Rejected: only workflows and actions held high
- Rejected: only the `quest` class

Where it lands:

- `src/core/risk.ts`: add both workflow paths to `ALWAYS_HIGH` and rewrite
  its comment, which says workflows are not held high because their mistakes
  fail the repository's own checks. Add the default class beside it, merged
  into what a base's risk file offers. `heldHigh` already feeds
  `land-fixer.ts` too, so it picks up the workflow paths.
- `classify` in `src/cli/review.ts`: a base with no `RISK.md` returns
  medium by `default` before any class is offered. Recommended: when the
  base has no risk file and the default classes offer one for the changed
  paths, run the classifier with the default classes and no file text;
  otherwise keep today's medium default. A deterministic low for any
  `quest/**`-only diff would skip judging the rule, and the record would
  need a new `Classified:` kind.
- `TIER_SCALE` names workflows as medium; once the paths hold them high
  the classifier never sees one, so drop them from that list.
- `assets/skills/run.md`'s trivial-pick rule lists `RISK.md`,
  `.github/workflows/`, and `.github/actions/` itself, whatever the record
  says. Recommended: drop that list and rely on `quest status` showing the
  head high plus the base's `## High` paths, since the pick already
  requires a counting `review-record` line, which the new defaults now
  classify high. If a review finds the skill judges before any record
  exists, keep the list instead, worded as quest's built-in high paths.
- README's Risk tiers section and `quest review --help` in
  `src/cli/main.ts`: name both defaults, and change "a base with no
  `RISK.md` makes every change medium" to match the recommended classify
  path. Keep the README example consistent with `--help`.
- This repository's `RISK.md`: the `quest` class scoped to `quest/**`
  ([kixel-ai/quest#910](https://github.com/kixel-ai/quest/pull/910)) is
  redundant once the default lands; delete it. Also drop
  `.github/workflows/release.yml` from its `## High` and the prose calling
  its other workflows medium.

Open questions, with recommendations:

- How a repository's `RISK.md` overrides or extends a default class.
  Recommended: a class it lists under the same name replaces the default,
  scope and rule, so a repository can narrow or widen it; any other name
  adds a class. Offer no way to drop a default or an `ALWAYS_HIGH` path
  until a repository needs one.
- Records: [kixel-ai/quest#888](https://github.com/kixel-ai/quest/pull/888)
  reads a record as stale once the base's `RISK.md` changes, but a new
  quest release that changes the defaults does not. Recommended: accept
  that; the defaults change rarely, and the next review reclassifies.

Risk: the PR is high. It changes `assets/` and when an agent may merge
without asking in every repository, as this repository's `RISK.md` reads
it. Changing `ALWAYS_HIGH` also changes an export Kixel Code imports from
`quest/core`; report it under the PR's public API.

Tests:

- A base with no `RISK.md` offers `quest` for a plan-only diff, and the
  classifier runs.
- A base with no `RISK.md` holds a change to `.github/workflows/` or
  `.github/actions/` high by the paths, with no model.
- A base whose `RISK.md` lists its own `quest` class uses its scope and
  rule instead of the default's.
