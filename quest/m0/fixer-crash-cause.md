# [XS] A crashed land fixer's handback names the wrapper's error

## Goal

When a land fixer's wrapper fails, the handback's one-line summary on the PR
names the wrapper's own error, such as `upload exceeds 256 MiB`, not only
`fixer crashed (exit 1)`, and its recommendation fits that cause instead of
always sending the PR to `/quest-iterate`.

## Plan

On 2026-11-22 every moq-dev/moq.pro fixer result was dropped by a size cap
in the maintainer's host's fixer wrapper, and the handbacks read
`fixer crashed (exit 1); run /quest-iterate`, as on
[moq-dev/moq.pro#4403](https://github.com/moq-dev/moq.pro/pull/4403),
whose fixer had committed a fix. The cause, `quest land check: upload
exceeds 256 MiB`, was only the last line of the output tail that
`outputSection` quotes under a long quote of the gate's failure, so the
sessions that read the handback missed it and looked for it in the host's
journal. `test/land-watch.test.ts`'s crash case already feeds that line
through the tail and asserts only the bare `fixer crashed (exit 1)`.

- Lift the wrapper's last error line into the summary that `settle` builds
  from `exited` in `src/cli/land-fixer.ts`. The wrapper's lines carry its
  `quest land check:` prefix; decide whether quest keys on that prefix or
  the wrapper writes its error somewhere quest reads apart from the
  agent's output, and record the choice here.
- Redact and bound it as the output tail is.
- [kixel-ai/quest#855](https://github.com/kixel-ai/quest/pull/855) changes
  `exited` for exit 124 in the same spot; merge with it.

The wrapper's cap itself is kixel-ai/dotfiles' work, in its quest
`quest/m0/fixer-result-bundle.md`.

## Hosts

- linux - land fixers run on the Linux hosts
