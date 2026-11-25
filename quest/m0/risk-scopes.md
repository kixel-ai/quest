# [S] Path scopes on this repository's automatic classes

## Goal

Each `## Automatic` class in this repository's `RISK.md` that can name the
paths it covers carries a path scope, so `quest review` offers it only to a
change inside it.

## Plan

The parser landed without scopes in this repository's own `RISK.md`. The
merge queue checks the merged tree with a `quest` built from the base
(`.github/workflows/queue-build.yml`), and a base from before the parser
reports every scoped class as malformed. Once `main` carries the parser,
the scopes can land. `quest review` still reads the base's `RISK.md` with
the branch's own parser, so after they land, a branch that has not merged
`main` since the parser did fails with "the base's RISK.md cannot be
read". The PR's body says to merge `main` to fix that.

Recommended lines, for the implementer to check against the tree and
`quest usage`'s per-class numbers:

- `test` (`test/**`, `scripts/*.test.sh`) - only tests, their fixtures, or
  benchmarks. The only benchmark, `scripts/gate-bench.sh`, lies outside
  the scope, so drop "benchmarks" from the rule or add it.
- `quest` (`quest/**`) - only plans. `README.md`, `docs/`, and `assets/`
  are read by users and every agent, so they stay out.
- `refactor` (`src/**`, `test/**`) - behavior and output unchanged.

A scope pattern names whole paths, so a directory needs a trailing `/` or
`/**`.

Decided (coordinator, maintainer away, in
[kixel-ai/quest#859](https://github.com/kixel-ai/quest/pull/859)):
✅ leave `chore` unscoped (rejected: scope it to lockfiles).
`AGENTS.md`'s standing trivial pick goes through it, at any tier. Its rule
also takes "another change as small", and covers bumps of the
github-actions group, which change `.github/workflows/`. A scope such as
(`package.json`, `bun.lock`, `flake.lock`) would end both, and the
classifier already judges the diff against the rule.

Validate by replaying recent merged PRs' changed files, both sides of
each rename, through `classesFor` against the new file. The PRs classed
`internal-docs` since 2026-10-01 were all plan-only, so each should still
be offered `quest`.
