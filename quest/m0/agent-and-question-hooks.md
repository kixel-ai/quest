# [M] Block agent stalls in Stop hook and missing recommendations in PreToolUse

## Goal

Move two recurring agent mistakes from prose into `quest hook` (`src/cli/hooks.ts` and `src/cli/rules.ts`):

1. **Block stalls on running background agent/wait tasks:** Extend `Stop` and `SubagentStop` in `src/cli/hooks.ts` / `src/cli/rules.ts` to refuse ending a turn while background `quest agent` (`start` or `resume`) or `quest wait` commands started by that session are still running, matching the existing `quest gate` refusal.
2. **Enforce `(Recommended)` on blocking question dialogs:** Add a `PreToolUse` hook check on `AskUserQuestion` (Claude Code) and `request_user_input` (Codex) that denies any multi-option question (2 or more options) when no option ends with `(Recommended)`, naming the fix in the denial reason, and update `quest setup`'s hook matchers accordingly. Trim the now-enforced recommendation reminder from always-loaded prose where hooks run (keeping it in `CHECKED_CONTEXT` or non-hook guidance).

Non-goal: checking option text semantics beyond `(Recommended)` (such as requiring `"Explain it first"`), which remains judgment-based in [Mold common maintainer answers into dialog rules](/quest/m0/dialog-options.md).

## Plan

Decided 2026-11-21 (maintainer, `/quest-plan`, from a 22-day transcript audit across three of the maintainer's hosts):

- Should we add both the `Stop` hook extension (`quest agent` / `quest wait`) and the `PreToolUse` `(Recommended)` hook?
  - ✅ Yes, add both hooks (recommended)
  - Rejected: `Stop` hook only (skip `AskUserQuestion` hook)

Evidence from the 2026-11-21 audit and the 2026-11-18 [mistake audit](/quest/m0/mistake-audit.md):

- Stalls until nudged remained the top typed-message failure class at 5.0 per 100 messages in the 2026-11-18 audit (and 53 short `"continue"` / `"try again"` / `"?"` nudges over 22 days). `runningGates` in `src/cli/rules.ts` currently blocks `Stop` only on background `quest gate` commands, letting coordinators end their turn while `quest agent start|resume` or `quest wait` background tasks are still running.
- 79 of 2,577 dialog answers since 2026-11-15 (3.1%) still omitted `(Recommended)` on every option (29 in `quest-plan`, 15 in `quest-afk`, 9 in `quest-run`), prompting repeated `"whatever you recommend"` / `"don't care"` custom replies (48 over 22 days).

This quest edits `assets/AGENTS.md` (if trimming the enforced reminder), which the maintainer asked for by planning it.

Agent's choices, for the implementer to revisit:

- Generalize `runningGates` in `src/cli/rules.ts` (for example to `runningTasks` matching `quest gate`, `quest agent start`, `quest agent resume`, and `quest wait`, using the same `ID: <id>` transcript-ownership filter so one agent is never blocked by another agent's tasks). When the transcript is missing or unreadable (a `SubagentStop` with an empty `agent_transcript_path`), ownership of a task cannot be shown: keep `quest gate` counting every match, as `runningGates` does today, because a gate is short and a refusal ends with it, but never count `quest agent` or `quest wait` tasks, since another agent's long-running one could block this agent's stop and checkout release indefinitely. Update the `Stop` refusal message in `src/cli/hooks.ts` to name the running commands clearly.
- Add `AskUserQuestion` to `CLAUDE_HOOKS`'s `PreToolUse` matcher (`Bash|Write|Edit|MultiEdit|AskUserQuestion`) and `request_user_input` (and `request_user_input_async`, if Codex matches it) to `CODEX_HOOKS`'s `PreToolUse` matcher in `src/cli/hooks.ts`. Verify Codex's exact `PreToolUse` payload shape for `request_user_input` before implementing; if Codex does not fire `PreToolUse` on built-in user-input tools, enforce it on Claude Code and document the Codex limitation in the PR body and tests rather than guessing.
- Check each question in `tool_input.questions` (handling both `{ label: string }` objects and plain string options, matching `src/cli/messages.ts`'s `RECOMMENDED = /\(recommended\)\s*$/i` regex): pass any question with fewer than 2 options, and deny when any 2+-option question has zero options matching `RECOMMENDED`.
- Add unit tests in `test/rules.test.ts` and `test/hooks.test.ts` covering running `quest agent` / `quest wait` Stop refusals for owned tasks, the unavailable-transcript case (a `quest gate` still refuses, another agent's `quest wait` and `quest agent` do not), multi-question `AskUserQuestion` / `request_user_input` passes and denials, and `quest setup` matcher upgrades.

## Related

- [Mistake audit](/quest/m0/mistake-audit.md) - tracks stalls and recommendation rates weekly
- [Mold common maintainer answers into dialog rules](/quest/m0/dialog-options.md) - prose dialog rules that complement the `(Recommended)` hook
