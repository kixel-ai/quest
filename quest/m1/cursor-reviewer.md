# [L] quest review runs reviewers through the Cursor CLI

## Goal

`quest review --harness cursor --model <id> [--effort <level>]` reviews a branch through Cursor's CLI (`agent -p`), read-only, on the user's own Cursor login, so a contributor with a Cursor plan can review with Gemini 4 Carbon or any other model Cursor serves. The PR scores Gemini 4 Carbon through Cursor with `quest eval run` against the current reviewers, and moves it ahead of Codex Sol in each PR size's `REVIEWERS` ranking where it catches more culprits per dollar.

Non-goals: Cursor as a writer, iterate, or land-fixer harness; a Grok or other non-Gemini entry in the ranking, which [the model check](/quest/m1/model-check.md) can add from its own evidence once the harness exists.

## Plan

Decided 2026-11-16 (user, /quest-plan). The user reports Gemini 4 Carbon, run through Cursor, catching bugs that Claude Opus 5.5 at medium effort missed in their own work, at a lower price.

- What should the quest promise?
  - ✅ an opt-in reviewer harness, scored with `quest eval run` before any ranking change (recommended)
  - Gemini in the default ranking right away (rejected: no eval, which `AGENTS.md` requires for a change to `src/cli/models.ts`)
  - a generic any-model harness again (rejected: [moq-dev/quest#701](https://github.com/moq-dev/quest/pull/701) removed opencode's on 2026-11-13; Cursor reaches the same models through one subscription the user already has)
- Which harness?
  - ✅ the Cursor CLI (recommended): headless print mode, `--model`, `--resume <chatId>`, `--output-format stream-json`, and a read-only `--mode ask`; one login reaches Gemini, Grok, GPT, and Claude models
  - Google's Gemini CLI (rejected: a second login or subscription, and Gemini only)
- If Gemini 4 Carbon scores better:
  - ✅ the eval decides and this PR moves it ahead of Codex Sol where it wins (recommended: the question is which model should review Opus-written work, and the eval is the evidence the ranking change needs; the maintainer still judges it in review)
  - post the scores and leave the ranking to a `Maintainer:` decision (rejected)
- ✅ m1 (rejected: m0, m2): the public release promises contributors can run Quest on their forks, and one whose only plan is Cursor cannot run `quest review` today.

Guidance:

- Keep Cursor a reviewer-only harness, per the Non-goal: give `quest review` its own reviewer harness list (a `ReviewHarness` union beside `HARNESSES`, as `review.ts` and `review-record.ts` had before [moq-dev/quest#701](https://github.com/moq-dev/quest/pull/701)) rather than adding `cursor` to `HARNESSES` in `src/cli/agent.ts`, which would also reach `quest agent start --harness` and `transcriptFacts()`.
- Use the CLI's stored login (`cursor-agent login`), not `CURSOR_API_KEY`, as [moq-dev/quest#492](https://github.com/moq-dev/quest/pull/492) settled for the other harnesses. `cursor-agent status` exits 0 when logged out (`Not logged in`) and with expired credentials (`Logged in (unable to fetch user details)`), per Cursor CLI `2026.11.13-eacade1`, so the login check reads its output, not only its exit code, and a turn's `Authentication failed` maps to logged out.
- Strip Cursor's credential and model overrides from the reviewer's environment (`CURSOR_AGENT`, `CURSOR_API_KEY`, `CURSOR_AUTH_TOKEN*`, `CURSOR_MODEL`), and make `runningHarness()` recognize `CURSOR_AGENT`, so `quest review` from a Cursor session avoids the right writer.
- The reviewers run nothing from a reviewed head. Cursor's read-only `--mode ask` is necessary but not the isolation boundary: the reviewer must also load none of the user's or the checkout's rules, skills, plugins, MCP servers, hooks, or `.cursor/` config, the way `quest review` runs Codex with `--ignore-user-config`. The public `--help` has no flag for that. Hidden `--disable-project-configs` (`.cursor/cli.json` only), `--exclude-workspace-context` (workspace rules, skills, transcripts, and notes), and `--disable-indexing` exist in `2026.11.05-86047df` and `2026.11.13-eacade1`. `CURSOR_CONFIG_DIR` and `CURSOR_DATA_DIR` do not cover the rest: per `2026.11.05-86047df`'s bundle, it reads `~/.cursor/mcp.json` and the Claude plugins under `~/.claude/plugins` from `homedir()`, enables the plugins a workspace's `.claude/settings.json` lists, and loads skills from `.cursor/`, `.claude/`, `.codex/`, `.grok/`, and `.agents/` in both the home and the workspace. Recommended: run it with `HOME`, `XDG_CONFIG_HOME`, `CURSOR_CONFIG_DIR`, and `CURSOR_DATA_DIR` in a clean per-review directory that holds only the login, plus `--exclude-workspace-context`, `--disable-project-configs`, `--disable-indexing`, and `--sandbox enabled`. Check that the login survives a token refresh there: on Linux the CLI keeps it in `$XDG_CONFIG_HOME/cursor/auth.json`, or `~/.config/cursor/auth.json`, and a copy would split its refresh token as a separate Codex home would; on macOS its default store is the keychain, and `AGENT_CLI_CREDENTIAL_STORE=file` moves it to `~/.cursor/auth.json`. Verify it with a test like `test/live/review-sandbox.test.ts`'s: an untrusted checkout whose rules, skills, plugins, MCP config, and hooks try to read outside the review snapshot or run a process, on Linux and macOS. If the pinned CLI cannot reliably disable both inherited user config and checkout config, record that under `## Waiting` instead of shipping the harness.
- Run the CLI as `cursor-agent`, not `agent`: nixpkgs' `cursor-cli` installs only `cursor-agent` (and is unfree), and a Grok CLI also installs an `agent` binary (`agent --version` printed `grok 1.0.77` on one of the maintainer's hosts), so `agent` on `PATH` may not be Cursor's.
- The CLI has no `--effort` flag (effort rides on the model, as `model[effort=high]`, only for models that take it) and no output-schema flag. Map the effort ladder onto that syntax where the model takes it; where it does not, run the model at its one effort and skip the shadow, as `quest review` does for an effort off the ladder. With no `REVIEWERS` entry to supply one, `--effort` stays required for a Cursor model that takes an effort, as `pickReviewer()` requires it today, and is not needed for one that takes none. Parse the verdict from the response text as `verdict()` already does.
- `quest review` classifies the head's risk with the first `CLASSIFIERS` entry that can run before any reviewer starts, and today that list holds only Claude Haiku and Codex Sol, so a Cursor-only contributor would stop there. Append a cheap Cursor-served classifier last (its id from the CLI's model list), so classification reaches Cursor only when neither of the others can run.
- Detect Cursor's usage-limit and logged-out errors from its structured output as a `ReviewLimitError` or `ReviewerUnavailableError` in `src/cli/review.ts`, so `quest review` passes the round past an unavailable Cursor reviewer as it does the other harnesses'.
- Look up Gemini 4 Carbon's Cursor model id with the CLI's model list rather than guessing it; record the CLI version checked.
- `quest eval run` prices sessions through [kixel-ai/token-max](https://github.com/kixel-ai/token-max), which reads only Claude Code and Codex transcripts, so a Cursor run would report a lower-bound `$0.00`. Recommended: add Cursor transcripts to token-max in its own PR first, since `quest eval` already delegates all pricing there; else price Cursor seats in `quest eval` from the usage its stream reports. The culprits-per-dollar comparison needs one of them before the ranking change.
- Run `quest eval run` with the base's build and the head's, per `AGENTS.md`, and put both scores, the per-size catch rates, and their cost in the PR's `## Validation`. Compare Carbon with Sol for each size, and with Opus and Sonnet where they review.
- Keep the harness opt-in (`--harness cursor`) until the eval moves a Cursor model into `REVIEWERS`; contributors without Cursor installed then fall through past it, as `quest review` passes an uninstalled reviewer's round to the next.
- Update `README.md`'s reviewer list and `quest review --help` to name the new harness.

## Related

- [Model check](/quest/m1/model-check.md) - audits each milestone's reviewer ranking

## Waiting

- Maintainer: log Cursor's CLI in on a Linux host and a macOS host of the maintainer's, at a version no older than `2026.11.13-eacade1`, so an agent can verify the reviewer's isolation live, read the model ids from `cursor-agent --list-models`, record Cursor's real usage-limit and logged-out output, and run the eval on the maintainer's Cursor plan. Check with `cursor-agent status`, which prints `Logged in as <email>` when done. An agent cannot finish Cursor's browser login on the maintainer's account or spend that plan unasked. Considered: an agent driving the maintainer's signed-in browser through `NO_OPEN_BROWSER=1 cursor-agent login`'s URL, which the maintainer can authorize instead. Each host's setup is planned in kixel-ai/dotfiles' quest tree. As of 2026-11-17, no such host had a logged-in Cursor CLI.
- kixel-ai/token-max: `token-max sessions` prices Cursor CLI sessions, so `quest eval run` reports Cursor reviewers' real cost instead of a lower-bound `$0.00`. Check that a Cursor review session's line in `token-max sessions` shows a nonzero cost. Advance it with `/quest-plan` in that repository; its tree had no such quest on 2026-11-17. If that stalls, the Plan's fallback prices Cursor seats in `quest eval` from the usage its stream reports.
