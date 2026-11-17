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

- Add `cursor` to `HARNESSES` and `HARNESS` in `src/cli/agent.ts`, and its login check (`agent status`; the login command is `agent login`) to `LOGINS`, using the CLI's stored login, not `CURSOR_API_KEY`, as [moq-dev/quest#492](https://github.com/moq-dev/quest/pull/492) settled for the other harnesses.
- The reviewers run nothing from a reviewed head. Keep that for Cursor: read-only mode, no MCP servers or hooks, and none of the checkout's own `.cursor/` rules, settings, or MCP config, the way `quest review` runs Codex with `--ignore-user-config`. Verify it with a test like `test/live/review-sandbox.test.ts`'s and, if the CLI offers no supported way to skip project config, record that under `## Waiting` instead of shipping the harness.
- Detect Cursor's usage-limit and logged-out errors so [the quota fallthrough](/quest/m0/review-quota-fallthrough.md) treats Cursor like the other harnesses.
- Look up Gemini 4 Carbon's Cursor model id with the CLI's model list rather than guessing it; record the CLI version checked.
- Run `quest eval run` with the base's build and the head's, per `AGENTS.md`, and put both scores, the per-size catch rates, and their cost in the PR's `## Validation`. Compare Carbon with Sol for each size, and with Opus where Opus reviews.
- Update `README.md`'s reviewer list and `quest review --help` to name the new harness.

## Related

- [Quota fallthrough](/quest/m0/review-quota-fallthrough.md) - falls through the ranking this adds to
- [Model check](/quest/m1/model-check.md) - audits each milestone's reviewer ranking
