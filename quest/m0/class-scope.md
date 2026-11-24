# [M] Path scopes on automatic classes

## Goal

An `## Automatic` class line in `RISK.md` may carry a path scope, backticked
patterns in parentheses after its name, that every changed file must match:

```markdown
## Automatic
- `docs` (`docs/**`, `**/*.md`) - only documentation no other repository reads
- `test` - only tests, fixtures, or benchmarks
- `scratch` (`experiments/**`) - anything
```

`quest review` checks the scope mechanically against the base's `RISK.md`
before its classifier runs, so the classifier can name only a class whose
scope holds every changed path, and judges just the prose rule. `quest check`
reports a malformed scope. The README documents the format, and this
repository's own classes use commit-type names.

## Plan

Decided 2026-11-24 (maintainer, `/quest-run` on
[kixel-ai/kixel.quest#133](https://github.com/kixel-ai/kixel.quest/pull/133#issuecomment-7122666719)):

- ✅ Named `## Automatic` classes are the only `RISK.md` list that lands a PR
  on its own; Kixel Quest retires its path-glob `## Merges on its own`
  (rejected: keeping both lists). One class such as `docs` can cover more
  than one folder.
- ✅ A class line is a name, using commit-type names such as `docs`, `test`,
  `refactor`, `chore`; an optional path scope every changed file must match,
  checked mechanically from the base's `RISK.md` so the classifier cannot
  widen it; and a prose rule the classifier judges. The PR title's commit
  type is only a hint (rejected: trusting the commit type alone, since it is
  the author agent's claim; classes with no way to scope paths, since "this
  folder doesn't matter" is better as a hard glob).
- ✅ A class still needs a low tier to land on its own.

Decided by the planning agent, 2026-11-24: ✅ rename this repository's
classes to commit-type names, so the title's type reads beside the class it
claims and a mismatch stands out (rejected: keeping `tests`,
`internal-docs`, `trivial`, which match no title anyone writes). Nothing is
in production, so old `- Class:` records need no migration; `quest usage`
lists them under their old names. Recommended lines, for the implementer to
check against the tree and `quest usage`'s per-class numbers:

- `test` (`test/**`) - only tests, their fixtures, or benchmarks
- `docs` (`quest/**`) - only plans, which no user or other repository reads.
  `README.md`, `docs/`, and `assets/` are read by users and every agent, so
  they stay out of the scope.
- `refactor` (`src/**`, `test/**`) - behavior and output unchanged, such as a
  rename inside a module, a simplification, or a comment-only change, which
  `internal-docs` covered
- `chore` - a dependency or pin bump, scoped to the files those bumps change
  (`package.json`, `bun.lock`, `flake.lock`, and the pin's own file). Drop
  "from any author, which lands once a maintainer's local `quest review`
  record passes on its head" from the line:
  `/quest-run`'s trivial-PR rule already says it, and a class needs a low
  tier.

Agent's recommendations, for the implementer to revisit:

- Parse the scope in `automaticClass` (`src/core/risk.ts`) as `(`, one or
  more backticked `patternError` patterns joined by `, `, and `)`
  between the name and ` - `, and add it to `Class`. Empty parentheses, an
  unbackticked or invalid pattern, or anything else between the name and
  ` - ` is a problem, which `quest check` already prints from
  `parseRiskFile`.
- In `classify` (`src/cli/review.ts`), offer the classifier only the classes
  whose scope matches every changed path, both sides of a rename (the
  `changed` list the always-high check already reads), and an unscoped class
  always; `classSchema` and `classed` then refuse any other name. Show each
  offered class's scope beside its rule in the prompt, and say the scope
  already holds. A change with no changed path falls in no class.
- Keep the title out of the classifier, whose prompt already judges the diff
  rather than the title: the hint is for the person reading the class, and
  Kixel Quest's card shows it there.
- Docs: the README's Risk tiers section (format, example with a scope, and
  that the classifier names a scoped class only when every path fits),
  `quest review --help`'s class sentence, and `RISK.md`'s own list.

Tests: a scoped class parses with its patterns; an unscoped one parses with
none; empty parentheses, an unbackticked pattern, a pattern `patternError`
refuses, and text between the scope and ` - ` are each reported by line; a
change with a path outside a class's scope never offers that class to the
classifier, a rename counting its old path; and a change inside it does.

## Related

- [kixel-ai/kixel.quest's automatic classes](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/automatic-classes.md) - the queue landing a low PR in a scoped class, which waits on the release carrying this
