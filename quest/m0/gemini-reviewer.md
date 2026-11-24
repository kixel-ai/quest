# [L] quest review runs Gemini reviewers through the Antigravity CLI

## Goal

`quest review --harness agy --model <id> [--effort <level>]` reviews a branch through Google's Antigravity CLI (`agy -p`), read-only, isolated from the checkout's and the user's config, on the user's own Antigravity login, so a contributor with a Google AI plan can review with Gemini 4 Carbon. The harness ships opt-in; whether Carbon moves ahead of the size's Codex entry (Sol, or Astra at XL) in a PR size's `REVIEWERS` ranking is judged later from real PRs, by the culprits per dollar `quest usage` shows. Once [reviewer rungs](/quest/m0/reviewer-rungs.md) has landed, its rung placement, by cost and quality, decides that instead.

Non-goals: `agy` as a writer, iterate, or land-fixer harness; models other than Gemini in the ranking, which [the model check](/quest/m1/model-check.md) can add from its own evidence once the harness exists.

## Plan

Decided 2026-11-16 (user, /quest-plan), still standing. The user reports Gemini 4 Carbon catching bugs that Claude Opus 5.5 at medium effort missed in their own work.

- ✅ An opt-in reviewer harness before any ranking change (rejected: Gemini in the default ranking right away; a generic any-model harness, which [kixel-ai/quest#701](https://github.com/kixel-ai/quest/pull/701) removed).
- Amended 2026-11-23 (maintainer, [on kixel-ai/quest#831](https://github.com/kixel-ai/quest/pull/831#issuecomment-7118011769)): ✅ no eval scores Carbon and this PR leaves the ranking as it is; real-PR stats decide a ranking change later (was: an eval decides and this PR moves Carbon ahead of Codex Sol where it wins). Amended 2026-11-23 by [kixel-ai/quest#831](https://github.com/kixel-ai/quest/pull/831#issuecomment-7111249892): XL's Codex entry is now Astra high, and once [reviewer rungs](/quest/m0/reviewer-rungs.md) has landed, its rung placement decides instead of a ranking.
- ✅ m1 (rejected: m0, m2): contributors must be able to run `quest review` on their forks, including those whose only plan is Google's.

Decided 2026-11-21 (maintainer, /quest-plan), carried over from the Cursor plan: ✅ a review reaches the login where the CLI keeps it, never a copy, so the refresh token stays in one place (rejected: a copied credential file, which splits it). The isolation test must also show a hostile checkout cannot read other credentials that store holds.

Decided 2026-11-22 (maintainer, /quest-run on [kixel-ai/quest#805](https://github.com/kixel-ai/quest/pull/805), then /quest-plan):

- Which harness?
  - ✅ The Antigravity CLI, `agy`
  - Rejected: the Cursor CLI. The maintainer uses Cursor only through a Grok subscription, and on 2026-11-21 its plan refused every Carbon turn with "Gemini 4 Carbon is not included in your weekly usage".
- Which login?
  - ✅ The maintainer's Google AI Ultra login, run the way T3 Code's Antigravity provider runs `agy`. The maintainer: "agy is allowed for T3Code. We should do the same thing."
  - Rejected: an AI Studio or Gemini Enterprise API key; deleting the quest; waiting on Google.
  - Google's FAQ (https://antigravity.google/docs/faq, read 2026-11-22) says "Wrapping `agy` inside third-party coding agents or applications, or automating account rotation, is not supported under consumer plans", and that using third-party software to access Antigravity "can result in suspension or termination of your account". It recommends an API key for third-party agents. The maintainer chose the Ultra login knowing this.
- ✅ Close #805, which holds only a claim commit and the Cursor findings, once this replan merges (rejected: leave it open).

Decided 2026-11-22 (maintainer, `/quest-plan` of the routing audit in [kixel-ai/quest#826](https://github.com/kixel-ai/quest/pull/826)): ✅ m0 (rejected: leave it in m1), since [review seats](/quest/m0/review-seats.md) seats Gemini on every medium- and high-tier PR once this harness exists. Since 2026-11-23, review seats draws each seat from the round's rung instead of a ranking.

The maintainer's Ultra login (kixelated@gmail.com) was signed in on 2026-11-22 on the Linux workstation that runs agent sessions (`agy` 1.5.14) and on the macOS laptop (`agy` 1.5.6, run from the dotfiles flake, since the laptop's Nix profile predates `agy`). `agy models` lists `gemini-4-carbon-low`, `-medium`, and `-high` on both. The CI host and the desktop are not signed in.

Guidance:

- [kixel-ai/quest#805](https://github.com/kixel-ai/quest/pull/805)'s body holds the Cursor probes in full. Repeat each one for `agy` before choosing the isolation design:
  - A clean `HOME` did not keep out workspace config. Cursor ran the checkout's `.cursor/` and `.claude/` hooks as the user, outside its sandbox. Plant every format another CLI reads (`.claude/`, `.codex/`, `.agents/`, `.gemini/`, `AGENTS.md`, `GEMINI.md`), not only `agy`'s own.
  - Hooks fired on read and shell events, not only at session start.
  - Run from inside a repository, including its `.git/`, Cursor walked up to the root's hooks and rules. Run from a directory outside any repository, it still loaded ancestor rules. Run from an empty directory outside any repository, reading the checkout by absolute path, nothing planted loaded. That is the candidate design if `agy` also scopes config to its workspace (`--add-dir` may serve the checkout).
  - The read tool read outside the workspace, and the read-only mode blocked every shell call, including `git diff`. Check what `agy --mode plan` and `--sandbox` confine and allow.
  - Resume was keyed by workspace path and silently started an empty chat from another directory. Test `--conversation <id>` across a changed working directory.
  - The login depended on display variables over ssh. Find where `agy` keeps its login (it keeps state under `~/.gemini/antigravity/`) and whether the review fails loud, as logged out, when it cannot reach it.
  - A headless run spawned `npx` helpers from the workspace. Plant a `package.json` and `node_modules/.bin/` binaries.
- `agy` 1.5.14 (the maintainer's workstation, 2026-11-22) has the flags a reviewer needs: `-p`, `--output-format stream-json`, `--json-schema` for the verdict, `--effort low|medium|high|xhigh|max`, `--mode plan`, `--sandbox`, `--settings` (inline, never saved), `--disable-slash-commands`, and `--conversation <id>`. `agy models` lists model ids only when signed in. Look up Carbon's id there rather than guessing, and record the CLI version you checked.
- Read T3 Code's Antigravity driver for how it launches `agy` (print mode or `agy acp`), and match it, since the maintainer's reason for using the Ultra login is that use.
- Keep `agy` a reviewer-only harness: give `quest review` its own `ReviewHarness` union beside `HARNESSES`, rather than adding `agy` to `HARNESSES` in `src/cli/agent.ts`, which would also reach `quest agent start --harness` and `transcriptFacts()`.
- Strip credential and model overrides from the reviewer's environment, so it reviews on the CLI's login as [kixel-ai/quest#492](https://github.com/kixel-ai/quest/pull/492) settled for the other harnesses. Make `runningHarness()` recognize an `agy` session, so `quest review` from one avoids the right writer.
- The reviewers run nothing from a reviewed head. Verify it with a test like `test/live/review-sandbox.test.ts`, on Linux and macOS: an untrusted checkout whose rules, skills, plugins, MCP config, hooks, and helper binaries try to read outside the review snapshot or run a process. If the pinned CLI cannot reliably keep out both user and checkout config, record that under `## Waiting` instead of shipping the harness.
- Append a cheap `agy`-served classifier last in `CLASSIFIERS`, so a contributor with only `agy` can still classify risk.
- Detect `agy`'s usage-limit and logged-out errors from its structured output as a `ReviewLimitError` or `ReviewerUnavailableError`, so the round passes over an unavailable reviewer.
- Ultra is a flat plan and token-max prices only Claude Code and Codex sessions, so a culprits-per-dollar comparison needs a per-token price. Recommended: price `agy` sessions from the usage their stream reports, at Google's API list price for the model, through token-max if it gains them first, else in `quest usage`.
- Keep the harness opt-in: no `agy` model enters `REVIEWERS` in this PR. Update `README.md`'s reviewer list and `quest review --help`.

## Hosts

- linux - the maintainer's workstation with `agy` installed
- macos - the isolation test must pass there before merge

## Waiting

- kixel-ai/token-max: `token-max sessions` prices `agy` sessions. Check that an `agy` review session shows a nonzero cost there. If that stalls, the Plan's fallback prices them in `quest usage`.

## Related

- [Model check](/quest/m1/model-check.md) - audits each milestone's reviewer ranking
