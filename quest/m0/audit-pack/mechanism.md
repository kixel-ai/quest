# [L] Ship the audit pack with the tree and deps audits

## Goal

`quest audit <name>` prints a shipped audit definition, and `quest audit`
lists them. A quest's optional `## Audit` section names one, and `quest
check` rejects an unknown name there or in the root README's skip list.
`quest init` plants a stub for each shipped audit that no quest names and
the skip list leaves out. The pack ships `tree`, today's `/quest-audit`,
whose skill is deleted, and `deps`.

## Plan

Decided 2026-11-15 (user, the [epic's](/quest/m0/audit-pack/README.md)
interview):

- Names? ✅ An `## Audit` section holding the one name, and `quest audit`
  (rejected: a Goal-line convention, which agents rewrite; `quest
  recurring`, which collides with `/quest-recurring`).
- Recurrence, written once and printed with every definition: the run's PR
  deletes its stub and re-creates it in the next milestone, with
  `Required` on the milestone it ran in (unless the stub names another
  trigger) and `## Scheduled` one week after the run's date. Before
  re-creating it, the run removes its path from every `Required`. A stub
  carries forward only what that repository learned: its baseline, scope
  exclusions, and what to check first.
- Planting: a stub goes in m(N+1) with `Required` on the lowest open
  milestone mN and no `Scheduled`. `quest init` creates m(N+1), or m0 and
  m1 in a tree with no milestones, with a one-line Goal when it is missing.
  It never edits a stub after planting it, which amends
  [m0's init decision](/quest/m0/README.md).
- `deps` covers direct dependencies, vendored code, forks, and pins:
  - New releases since the last run, major and minor at 1.0 or later, minor
    and patch below 1.0, skipping commit-hash pins such as nixpkgs:
    features to adopt, deprecations, and workarounds that can go.
  - Upstream health: archived or unmaintained upstreams, from cheap signals
    such as release and commit dates, and better alternatives researched
    only for those flagged.
  - Major upgrades the repository is held back from, with their cost.
  - Dependencies that are unused, or that the standard library or an
    existing dependency can replace.
- `tree` keeps `/quest-audit`'s checks; its decisions go under the run PR's
  `## Waiting`, since a run cannot prompt.

Agent's choices, for the implementer to revisit:

- Definitions live in `assets/audits/<name>.md`, embedded like the skills.
- Drop `quest-audit` from `src/cli/records.ts`'s planning prefixes and
  update every mention: `README.md`, `assets/AGENTS.md`, `docs/`, and
  [the root quest README](/quest/README.md), whose m1 quests are "due a
  `/quest-audit`".
- `/quest-recurring` says to plant a pack audit rather than plan a custom
  quest that repeats one.
- Run `quest init` from this checkout in the PR, so this repository's tree
  carries the `tree` and `deps` stubs.
