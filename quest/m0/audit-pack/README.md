# Base pack of recurring audits

## Goal

Every repository that runs `quest init` carries one recurring stub per
base-pack audit (`tree`, `deps`, `code`, `cost`, `docs`, `tests`), unless its
root `quest/README.md` skips it. Each stub runs a definition quest ships and
prints on demand, so improving an audit reaches every repository on its next
run instead of drifting per copy. `/quest-audit` becomes the `tree` audit.

Non-goals: repository-specific recurring work stays local, such as moq's
interop audit, release reviews, and vendor sync, performance audits, rind's
proof re-audit, and this repository's mistake audit and model check. Moving
moq's and moq.pro's existing audits onto stubs is work in their own trees.
`quest init` never rewrites a stub it planted.

## Plan

Decided 2026-11-15 (user, /quest-grill then /quest-plan), from a request
that `/quest-merge` research the changes in dependency-bump PRs, and an audit
of the recurring quests in the 13 repositories with quest trees:

- Where dependency research starts? ✅ A recurring quest (rejected:
  `/quest-merge` on bump PRs, since moq's Dependabot PRs auto-land through a
  workflow and never reach it; both; `/quest-run`'s end-of-run planning).
- Shared or per repository? ✅ Definitions shipped with quest, and a thin
  stub in each repository naming one and holding only its baseline, scope
  exclusions, what to check first, and any trigger override (rejected:
  `quest init` copying full templates, which drift as today's audits have;
  one central sweep from this repository, which cannot name a private
  repository's findings and leaves follow-ups outside their trees; a skill,
  whose description loads in every session).
- `/quest-audit`? ✅ Becomes the `tree` audit, and the skill is deleted
  (rejected: keeping the skill as well; leaving it as is). Its decisions go
  under `## Waiting` in the run's PR, as every audit's do.
- Members? ✅ `tree`, `deps`, `code`, `cost`, `docs`, `tests`. Performance
  stays local, since only repositories with benchmarks can run it.
- Grouping? ✅ One quest per audit (rejected: one stub running all; each
  repository choosing its grouping, which brings the drift back).
- Trigger? ✅ Once per milestone by default, which a stub may override, as
  moq ties its audits to the release cut (rejected: per milestone with no
  override; every N weeks). Each run also waits at least a week after the
  last one, so a milestone that closes fast does not rerun every audit.
- Discovery? ✅ `quest init` plants missing stubs (rejected, the agent's
  recommendation: `/quest-recurring` offering them; `quest check` warning).
- Opt-out? ✅ A skip list in the root `quest/README.md` (rejected: planting
  only on first init, so later pack members never arrive; no opt-out).
- First run? ✅ In m(N+1) with `Required` on the lowest open milestone mN,
  creating m(N+1) when missing (rejected: ready at once, about 78 runs across
  13 repositories; `deps` first and the rest later; planting in mN ungated
  or not at all where m(N+1) is missing).
- Pin bumps that plant stubs? ✅ Land as usual: every member fits every
  repository, and the bump body already lists the paths `quest init`
  changed (rejected: a `Maintainer:` wait on each bump). Duplicates in moq
  and moq.pro stay behind their milestone gate until their migration lands.
- Milestone? ✅ m0: the drift is in moq-dev's own repositories now.

Evidence, 2026-11-15: moq's `m3/audit-code` and moq.pro's `m1/audit-code`
define the same audit differently; dependencies are audited in moq's
`m3/audit-cost`, moq.pro's `m1/audit-code`, rind's `m2/upstream-updates`,
and rust2's `m0/nightly-bump`; 10 of the 13 repositories run no generic
audit.

## Related

- [Cut agent token waste](/quest/m0/token-waste/README.md) - dropping
  `/quest-audit` removes one skill description from every session
