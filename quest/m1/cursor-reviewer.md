# [L] quest review runs reviewers through the Cursor CLI

## Goal

`quest review --harness cursor --model <id>` reviews a branch through Cursor's CLI (`agent -p`), read-only, on the user's own Cursor login, so a contributor with a Cursor plan can review with Gemini 4 Carbon or any other model Cursor serves. The PR scores Gemini 4 Carbon through Cursor with `quest eval run` against the current reviewers, and moves it ahead of Codex Sol in each PR size's `REVIEWERS` ranking where it catches more culprits per dollar.

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
- Use the CLI's stored login (`agent login`), not `CURSOR_API_KEY`, as [moq-dev/quest#492](https://github.com/moq-dev/quest/pull/492) settled for the other harnesses. `agent status` exits 0 when logged out (`Not logged in`) and with expired credentials (`Logged in (unable to fetch user details)`), per Cursor CLI `2026.11.13-eacade1`, so the login check reads its output, not only its exit code, and a turn's `Authentication failed` maps to logged out.
- Strip Cursor's credential and model overrides from the reviewer's environment (`CURSOR_AGENT`, `CURSOR_API_KEY`, `CURSOR_AUTH_TOKEN*`, `CURSOR_MODEL`), and make `runningHarness()` recognize `CURSOR_AGENT`, so `quest review` from a Cursor session avoids the right writer.
- The reviewers run nothing from a reviewed head. Cursor's read-only `--mode ask` is necessary but not the isolation boundary: the reviewer must also load none of the user's or the checkout's rules, skills, MCP servers, hooks, or `.cursor/` config, the way `quest review` runs Codex with `--ignore-user-config`. The public `agent --help` has no flag for that; `2026.11.13-eacade1` has hidden `--disable-project-configs` (`.cursor/cli.json` only), `--exclude-workspace-context`, and `--disable-indexing`, while `.cursor/mcp.json` and `~/.cursor/mcp.json` still load unless `CURSOR_CONFIG_DIR` and `CURSOR_DATA_DIR` point at a clean directory and `--sandbox enabled` is set. Verify it with a test like `test/live/review-sandbox.test.ts`'s: an untrusted checkout whose rules, MCP config, and hooks try to read outside the review snapshot or run a process, on Linux and macOS (keychain login via `AGENT_CLI_CREDENTIAL_STORE`). If the pinned CLI cannot reliably disable both inherited user config and checkout config, record that under `## Waiting` instead of shipping the harness.
- `agent` has no `--effort` flag (effort rides on the model, as `model[effort=high]`, only for models that take it) and no output-schema flag. Map the effort ladder onto that syntax where the model takes it; where it does not, run the model at its one effort and skip the shadow, as `quest review` does for an effort off the ladder. Parse the verdict from the response text as `verdict()` already does.
- Detect Cursor's usage-limit and logged-out errors from its structured output so [the quota fallthrough](/quest/m0/review-quota-fallthrough.md) treats Cursor like the other harnesses.
- Look up Gemini 4 Carbon's Cursor model id with the CLI's model list rather than guessing it; record the CLI version checked.
- `quest eval run` prices sessions through [kixel-ai/token-max](https://github.com/kixel-ai/token-max), which reads only Claude Code and Codex transcripts, so a Cursor run would report a lower-bound `$0.00`. Recommended: add Cursor transcripts to token-max in its own PR first, since `quest eval` already delegates all pricing there; else price Cursor seats in `quest eval` from the usage its stream reports. The culprits-per-dollar comparison needs one of them before the ranking change.
- Run `quest eval run` with the base's build and the head's, per `AGENTS.md`, and put both scores, the per-size catch rates, and their cost in the PR's `## Validation`. Compare Carbon with Sol for each size, and with Opus and the third reviewer [the quota fallthrough](/quest/m0/review-quota-fallthrough.md) adds where they review.
- Keep the harness opt-in (`--harness cursor`) until the eval moves a Cursor model into `REVIEWERS`; contributors without Cursor installed then fall through past it, per the quota fallthrough.
- Update `README.md`'s reviewer list and `quest review --help` to name the new harness.

## Related

- [Quota fallthrough](/quest/m0/review-quota-fallthrough.md) - falls through the ranking this adds to
- [Model check](/quest/m1/model-check.md) - audits each milestone's reviewer ranking
