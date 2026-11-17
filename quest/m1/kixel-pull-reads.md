# [M] PR bodies and comments for repositories Kixel Quest hosts

## Goal

An agent working on a repository Kixel Quest hosts reads a PR's body,
comments, and reviews through `quest`, and is steered to `quest pr` when it
reaches for `gh`, so `/quest-iterate` and `/quest-review` run there without
`gh`.

## Plan

The forge writes gave `quest pr` its create, edit, comment, and resolve, but
an agent still reads a PR's body and discussion with `gh pr view`, which
cannot reach Kixel Quest, and nothing tells it to use `quest pr` instead.

- Add a `view` read to the forge interface and its wire, typed in
  `quest/core` like the others: the body, title, comments, and reviews, as
  `quest pr view <pr>` prints them. GitHub's backend reads them as `gh pr view
  --comments` shows them.
- Recommended: have `quest hook` deny `gh pr` and `gh api` calls in a checkout
  whose origin is on Kixel Quest, naming the `quest pr` command to run, rather
  than a prose rule in `quest context` that every task loads. Adding it to the
  checked rules in `src/cli/rules.ts` adds a line to the Checked section
  `quest context` prints, so confirm the wording with the maintainer first.

Tests: against the fake Kixel Quest, `quest pr view` prints a PR's body and
comments; and the hook denies `gh pr view` in a checkout whose origin is on
Kixel Quest while it lets the same call through on a GitHub checkout.

## Waiting

- Maintainer: whether the hook should steer `gh` calls on Kixel Quest
  checkouts to `quest pr`, which adds a checked rule to `quest context`.
  Recommended: yes, since an agent without it tries `gh`, fails, and has no
  pointer to the command that works.
