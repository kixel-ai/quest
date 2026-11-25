# [S] The land fixer falls to Gemini when Claude and Codex can't run

## Goal

`quest land fix` falls from Claude Code and Codex to Gemini's `agy` when both can't run (CLI missing, logged out, or at its usage limit), so a landing queue's fixer rounds don't wait for either reset.

## Plan

The writer lists already fall from Claude to Codex to Gemini, and the fixer already falls from Claude to Codex ([#898](https://github.com/kixel-ai/quest/pull/898)). The fixer stops there because `agy` runs only on a personal Antigravity login, and the fixer's container runs the PRs' own tests and builds with network access to `github.com` and the package registries, so a login in its HOME is readable by untrusted PR code. A Gemini fixer needs one of:

- `agy` behind a model proxy that holds the login, as Claude and Codex have (recommended, once a proxy serves Antigravity's models), or
- a credential for it scoped to the fixer's container alone, rotated, and kept out of the PR's checks.

Then add `{ harness: "agy", model: "gemini-4-neon" }` to `FIXERS` in `src/cli/models.ts`, run it from an empty directory beside the checkout, since `agy` loads the agent configuration of where it runs, and classify its limit and logout from its result event as `readerFor("agy")` does.

## Waiting

- Maintainer: choose how the fixer reaches Gemini, a proxy that holds the login (recommended) or a container-scoped credential; check that `quest land fix` with Claude and Codex unavailable runs `agy`.
