# Risk

`quest review` reads this file from the base to set each PR's risk tier, as
the README's Risk tiers section describes.

`quest` runs development in moq-dev's and Kixel's repositories. What merges
to `main` ships in the next release, which contributors and the maintainer's
hosts install, and a revert ships in the one after. A bug that agents act on
while its release is live is a risk every behavior change carries, and
medium covers it, including a bug in a record, comment, or upload `quest`
already writes. What a revert cannot undo is what a change newly makes
`quest` or its agents do beyond the repository: merge, post, upload, or
spend where they did not before.

What others rely on here:

- The rules and skills under `assets/`, which every agent session in those
  repositories loads.
- The `quest/core` and `quest/github` exports, which Kixel Code imports.
- The records `quest` writes into PR bodies and sends, and the output of
  `quest status`, `quest usage`, and `quest unblocked`, which skills,
  Kixel Code, and scripts parse.
- The reviewer's sandbox and the credentials `quest` passes to the agents
  it starts, which keep a change from instructing its own reviewer or
  reaching a secret.

A change is high when it:

- breaks a consumer of an export, a record, or that output: it removes or
  renames one, changes what an existing field or line means or how it is
  written, makes a reader refuse what the previous release wrote, or adds
  what a consumer must now supply, such as a required member of an
  interface it implements or an argument it passes. Such a change marks
  its title with `!`, though a `!` for a CLI flag alone is not this.
- changes when an agent may push, merge, post, or spend without asking,
  in `assets/` or in the code that acts on it.
- changes the reviewer's sandbox or the credentials an agent gets, or
  sends a new kind of data off the host or into a public comment, such as
  a new upload destination or command output it now posts. New fields in
  a record `quest` already sends are not this.

A change is medium when behavior others rely on changes and a revert
undoes it, such as an export, an optional field, or an output line that
existing consumers keep parsing, a new or changed command or option, a bug
fix, a skill or audit's instructions that leave remote-write authority
alone, or a routine dependency or pin bump.

Tests, plans under `quest/`, and documentation change nothing others rely
on, so they are low.

## Automatic

A low PR whose author has write access lands without the maintainer's pick
when its whole diff falls in one class below: every changed path matches
the class's scope in parentheses, and the change meets its rule. Only a PR
the maintainer picks changes this list, proposed with `quest usage`'s
numbers for the class: its PRs merged, the culprits among them, and their
wait on a person.

- `test` (`test/**`, `scripts/*.test.sh`) - only tests or their fixtures
  change
- `docs` (`quest/**`) - only plans change, which no user or other
  repository reads
- `refactor` (`src/**`, `test/**`) - code changes that keep every behavior
  and output the same, such as a rename inside a module, a simplification,
  or a comment-only change
- `chore` (`package.json`, `bun.lock`, `flake.lock`) - a dependency or pin
  bump

## High

- `assets/CONTEXT.md` - every agent session in every repository using
  Quest loads these rules, including when it may write remotely or merge
- `scripts/installer.sh` - users pipe it to a shell, and a release
  publishes it as it is
- `scripts/release-plan.sh` - it decides which merges publish a release
