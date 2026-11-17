# [XS] Plant this repository's audit stubs

## Goal

This repository's tree carries a stub for each of the six base-pack audits,
planted by `quest init` in one PR.

## Plan

Decided 2026-11-15 (user, on [#746](https://github.com/moq-dev/quest/pull/746)):
keep this follow-up, planting all six at once (rejected: each audit's PR
planting its own stub after its own pin bump; no follow-up). #746 could not
plant `tree` and `deps` itself, since the pinned `quest` that checks a PR
rejects audit names it does not know.

Run `quest init` with this checkout's build, then add to the `tree` stub's
Plan: check m1's public-release quests first, since they predate the
2026-11-13 decision in [the root README](/quest/README.md).

## Waiting

- Dependabot: the dev shell's `quest-pinned` knows all six audit names, so
  `quest check` accepts the stubs. Check that `quest audit` in the dev shell
  lists them; advance it with `nix flake update quest-pinned` once a release
  includes [moq-dev/quest#755](https://github.com/moq-dev/quest/pull/755),
  which ships `code`, `cost`, `docs`, and `tests`.
