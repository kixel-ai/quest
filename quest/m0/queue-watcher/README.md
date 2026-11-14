# [S] Land the queue watcher's first flaky-test disable on moq-dev/moq

## Goal

The queue watcher's end-to-end run on moq-dev/moq finishes with its last
step: a test the land fixer judged flaky in two `merge_group` builds is
disabled by a `quest-land/flaky-<sha>` PR that lands through moq's merge
queue, and moq's `main` passes `quest check` with the `quest/m0/flaky/` epic
and follow-up quest that PR added.

## Plan

Every other part of the run is done (checked 2026-11-14, from the watcher's
state on the maintainer's host and moq's PR comments):

- A failing build fixed and re-enqueued:
  [moq-dev/moq#8672](https://github.com/moq-dev/moq/pull/8672) (`check
  biome`) and [#8722](https://github.com/moq-dev/moq/pull/8722) (`cargo fmt`),
  both merged.
- A conflict resolved and re-enqueued:
  [moq-dev/moq#8439](https://github.com/moq-dev/moq/pull/8439), once by the
  merge driver alone and three times by the fixer, then merged.
- A flaky failure re-enqueued unchanged:
  [moq-dev/moq#8468](https://github.com/moq-dev/moq/pull/8468),
  [#8551](https://github.com/moq-dev/moq/pull/8551) and
  [#8694](https://github.com/moq-dev/moq/pull/8694), all merged.
- A design conflict handed back:
  [moq-dev/moq#8104](https://github.com/moq-dev/moq/pull/8104#issuecomment-6704142614),
  a modify/delete conflict on a quest file that "requires a content decision".

The watcher's `flaky.json` holds four tests, each with one verdict, so no
disable has run yet. The disable's fixed templates, the follow-up quest and
the epic README, pass `quest check` on moq's `main` as of
[moq-dev/moq#8668](https://github.com/moq-dev/moq/pull/8668).

Once the disable PR exists, check that it landed through the queue with no
maintainer's pick and that moq's `main` passes `quest check`, then delete this
epic. A disable the watcher refuses, or a disable PR GitHub refuses to
enqueue, is a bug in `quest land watch` to fix here.

## Waiting

- moq-dev/moq: one of the four tests in the watcher's `flaky.json` is judged
  flaky in a second `merge_group` build, and the watcher opens its disable PR.
  Check with `gh pr list -R moq-dev/moq --state all --search
  "head:quest-land/flaky-"`.
