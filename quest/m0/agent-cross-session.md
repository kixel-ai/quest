# [S] Quest agent closes cross-session messaging

## Goal

`quest agent start` and `resume` launch Claude Code with `--settings` holding `crossSessionInbound: refuse` and `permissions.deny` rules for `SendMessage` and `ListAgents`, so a headless agent neither receives messages from the person's other Claude Code sessions on the host nor lists or messages them.
Codex launches are unchanged, since Codex has no such channel.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` in kixel-ai/kixel.quest, recorded in its [jobs](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m1/jobs.md) quest's "Close cross-session messaging" bullet, which waits on this): ✅ close both directions in `quest agent` (rejected: building job steering on [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging), which is Claude only and needs agents to accept messages; leaving the default because hosts are trusted).
Why: with no `crossSessionInbound` value, a session that bypasses permission prompts delivers messages from another session that also bypasses them, and agents `quest agent` starts usually do, so one agent can ask another to act on its repository. On 2026-11-22 `ListAgents` from one session on the maintainer's host listed 13 live sessions across repositories, all messageable without approval.
Nothing here needs the channel: a coordinator resumes a headless agent with `quest agent resume`, not a message. Denying `SendMessage` also stops the agent continuing its own sub-agents, since one tool serves both; the worker skills don't, and only a coordinator such as `/quest-run` does, which runs in the person's own session.

- Today `claudeFlags()` in `src/cli/agent.ts` passes no `--settings`. Add one inline JSON value there, which both start and resume use.
- A `--settings` value overrides user settings; only managed settings, or a `refuse` from project or local settings, take precedence, per the [settings reference](https://code.claude.com/docs/en/settings-reference#crosssessioninbound). Confirm the effective value by reading the settings files that apply to an agent session under that precedence, not with `/status`, which shows no change for a refusing session.
- Denying the tools alone is not enough: an agent runs unsandboxed as the same OS user, so its shell can write to another session's inbox socket (`CLAUDE_CODE_MESSAGING_SOCKET`) and claim to bypass prompts. Refusing inbound protects the agent; the person's own sessions refusing inbound is kixel-ai/dotfiles' change, not this quest's.
- `refuse` also drops messages a session's own hooks or Bash commands post back to its socket. Quest posts none.
- Pin the Claude Code version this is checked against in a comment beside the settings, since the setting needs v2.1.224 or later and its precedence may change.
- `quest review`'s Claude seat (`claudeFlags()` in `src/cli/review.ts`) runs in `dontAsk` mode, which counts as prompting, so with no value it delivers every message from a session that doesn't bypass prompts, steering a reviewer mid-round, and its `--setting-sources ""` skips a `refuse` in the person's user settings. See the Waiting item. The land fixer needs nothing: it runs `--bare` in a container, and a bare session binds no socket.

Tests: a unit test that both start and resume argv carry the settings. Validate on the real surface with the pinned version and record it in the PR's `## Validation`: a `quest agent` session lists no `SendMessage` or `ListAgents` tool; a raw line written to its inbox socket from another process claiming bypass mode is not delivered, while the same write to a session started without the setting in bypass mode is, so the refusal is the setting's and not another cause's.

## Waiting

- Maintainer: should `quest review`'s Claude seat also refuse inbound messages? Its `--tools` list already omits `SendMessage` and `ListAgents`, so only `crossSessionInbound: refuse` would change. Options: refuse there too (recommended: a review verdict should come from the diff, not another session, and it costs one flag); leave review as decided, `quest agent` only. An agent can't settle this because the 2026-11-22 decision named `quest agent` only.

## Related

- [Kixel Quest jobs](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m1/jobs.md) - waits on this; its `## Waiting` item clears once `quest agent`'s Claude arguments carry the setting
