# [S] Quest agent and review close cross-session messaging

## Goal

`quest agent start` and `resume` launch Claude Code with `--settings` holding `crossSessionInbound: refuse` and `permissions.deny` rules for `SendMessage` and `ListAgents`, so a headless agent receives no messages from the person's other Claude Code sessions on the host and has no tools to list or message them.
`quest review` launches its Claude reviewer with `--settings` holding `crossSessionInbound: refuse`, so no other session can steer a round.
Neither stops an agent's shell from writing to another session's inbox socket; a session that refuses inbound is closed to that too, which for the person's own sessions is kixel-ai/dotfiles' change.
Codex launches are unchanged, since Codex has no such channel.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` in kixel-ai/kixel.quest, recorded in its [jobs](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m1/jobs.md) quest's "Close cross-session messaging" bullet, which waits on this): ✅ refuse inbound and deny the messaging tools in `quest agent` (rejected: building job steering on [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging), which is Claude only and needs agents to accept messages; leaving the default because hosts are trusted).
Why: with no `crossSessionInbound` value, a session that bypasses permission prompts delivers messages from another session that also bypasses them, and agents `quest agent` starts usually do, so one agent can ask another to act on its repository. On 2026-11-22 `ListAgents` from one session on the maintainer's host listed 13 live sessions across repositories, all messageable without approval.
Nothing here needs the channel: a coordinator resumes a headless agent with `quest agent resume`, not a message. Denying `SendMessage` also stops the agent continuing its own sub-agents, since one tool serves both; the worker skills don't, and only a coordinator such as `/quest-run` does, which runs in the person's own session.

Decided 2026-11-23 (maintainer, `/quest-run`, on [kixel-ai/quest#839](https://github.com/kixel-ai/quest/pull/839#issuecomment-7110694575)): ✅ `quest review`'s Claude reviewer also refuses inbound peer messages, passing `--settings` with `crossSessionInbound: refuse`, in this quest (rejected: only `quest agent`, which would leave reviews open to steering by another session). A review's verdict should come only from the diff.
Why: `claudeFlags()` in `src/cli/review.ts` runs the reviewer in `dontAsk` mode, which counts as prompting, so with no value it delivers every message from a session that doesn't bypass prompts, and its `--setting-sources ""` skips a `refuse` in the person's user settings.

- Today neither `claudeFlags()` in `src/cli/agent.ts` nor the one in `src/cli/review.ts` passes `--settings`. Add one inline JSON value to each; the agent's serves both start and resume. Confirm the reviewer's `--tools` list leaves `SendMessage` and `ListAgents` out, and deny them there too if it doesn't.
- A `--settings` value overrides user settings; only managed settings, or a `refuse` from project or local settings, take precedence, per the [settings reference](https://code.claude.com/docs/en/settings-reference#crosssessioninbound). Confirm the effective value by reading the settings files that apply to each session under that precedence, not with `/status`, which shows no change for a refusing session.
- Denying the tools does not close the outbound path: a session runs unsandboxed as the same OS user, so its shell can write to another session's inbox socket (`CLAUDE_CODE_MESSAGING_SOCKET`) and claim to bypass prompts. Refusing inbound protects the sessions Quest starts; the person's own sessions refusing inbound is kixel-ai/dotfiles' change, not this quest's.
- `refuse` also drops messages a session's own hooks or Bash commands post back to its socket. Quest posts none.
- Pin the Claude Code version this is checked against in a comment beside each setting, since the setting needs v2.1.224 or later and its precedence may change.
- The land fixer needs nothing: it runs `--bare` in a container, and a bare session binds no socket.

Tests: unit tests that the agent's start and resume argv and the reviewer's argv carry their settings. Validate on the real surface with the pinned version and record it in the PR's `## Validation`: a `quest agent` session lists no `SendMessage` or `ListAgents` tool; a raw line written to a `quest agent` session's inbox socket from another process claiming bypass mode, and one written to a `quest review` reviewer's socket claiming no bypass, are not delivered, while the same writes to sessions started without the setting in the same modes are, so the refusal is the setting's and not another cause's.

## Related

- [Kixel Quest jobs](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m1/jobs.md) - waits on this; its `## Waiting` item clears once `quest agent`'s Claude arguments carry the setting
