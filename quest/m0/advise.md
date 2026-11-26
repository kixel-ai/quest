# [L] Stuck-agent advisor command and skill

## Goal

Add a read-only `quest advise` CLI command and `/quest-advise` skill so any
agent that gets stuck (such as failing review convergence at `next decide` or
repeated findings, or looping before review) can ask a stronger frontier model
for fresh architectural guidance without requiring T3 Code.
`quest advise` runs a ranked advisor list (`gemini-4-neon` at `high` via `agy`,
falling through to `gpt-6.2-astra` at `high` via `codex`, then `claude-fable-5-2`
at `medium` via `claude`), enforces read-only sandboxing, enforces a hard cap of
one call per branch unless `--force` is passed, and records every call with
`role: "advising"` and full token/cost usage in `quest usage` and Kixel Quest.

Non-goals: requiring T3 Code; running `agy` for routine writes or reviews (which
stay Claude writes and Codex+Claude reviews); prescribing rigid pre-review
stuckness thresholds in prose.

## Plan

Decided 2026-11-26 (maintainer, `/quest-plan`):

- Scope? ✅ Both stuck-agent escalation (`quest advise`) and routine `--advisor`
  pairing with A/B arms per size ([Routine advisor A/B](/quest/m0/advisor-arms.md))
  (rejected: stuck-agent escalation only; review-only triggers; drop).
- Mechanism? ✅ New `quest advise` CLI command + `/quest-advise` skill,
  standalone without requiring T3 Code (rejected: coordinator-only via T3
  `delegate_task`; worker nested `delegate_task`).
- Triggers? ✅ Generic instructions so agents judge when they are stuck and need
  advice, naming review convergence failures (`next decide`, repeated findings)
  and pre-review loops as examples, with every call and its cost tracked by
  `quest` (rejected: `next decide` only; review-only without pre-review escape
  hatch).
- After receiving advice? ✅ Auto-iterate when the advice fits the quest's Goal
  and settled decisions (record a `Design change:` PR comment and review with
  `quest review --new`); stop and ask the maintainer when the advisor recommends
  changing scope/architecture or dropping the PR (rejected: always stop and ask;
  split behavior between `/quest-afk` and interactive `/quest-run`).
- Model order and harnesses? ✅ `gemini-4-neon` (`high`) via `agy` →
  `gpt-6.2-astra` (`high`) via `codex` → `claude-fable-5-2` (`medium`) via
  `claude`, restoring `agy` in `quest` solely for `quest advise` (rejected:
  `opencode` for Neon; `opencode` for all three; `xhigh`/`high` efforts;
  Codex+Claude only without Neon). Amending [the root quest README](/quest/README.md)
  narrowly keeps routine writes on Claude and routine reviews on Codex+Claude.
  Restoring `agy` on the maintainer's hosts is tracked as a follow-up in
  `kixel-ai/dotfiles`; until `agy` is back on `PATH`, `quest advise` falls
  through cleanly to `codex` (Astra) and `claude` (Fable).
- Guardrail? ✅ Read-only sandbox + `role: "advising"` telemetry + hard CLI cap
  of 1 call per branch (`--force` to override) (rejected: soft warning only).

The maintainer authorized the edits this needs in `assets/` (`assets/skills/advise.md`,
`assets/skills/review.md`, `assets/skills/iterate.md`, `assets/skills/run.md`,
`assets/AGENTS.md`) and `README.md`.

Recommended, for the implementer to confirm:

- **CLI (`src/cli/advise.ts`, `src/cli/models.ts`, `src/cli/main.ts`):**
  - Add `ADVISORS` in `src/cli/models.ts`: `[agy("gemini-4-neon", "high"), codex("gpt-6.2-astra", "high"), claude("claude-fable-5-2", "medium")]`.
  - Restore the read-only `agy` turn runner, deny rules, limit parsing, and
    sandbox test from commit `83d4e51f93^` (`quest!: remove Antigravity (#902)`),
    scoped strictly to `quest advise` (not `quest review` or `quest agent`
    writers, and not the risk classifier).
  - Run `quest advise [--base <remote>/<base>] [--branch <head-branch>] [--force] [--harness ... --model ... --effort ...] [question]`
    read-only against the branch, feeding the quest's Goal/Plan, repo
    `AGENTS.md`/`REVIEW.md`, PR body, saved `.git/quest/review/` rounds, and the
    caller's summary of what it tried and where it is stuck. Ask the advisor to
    start from scratch, compare 2–3 approaches (including patching vs
    simplifying/redesigning vs dropping), and recommend one without editing code.
  - Fall through `ADVISORS` on missing CLI, logged-out CLI, or usage limit,
    exiting 3 when every eligible advisor is unavailable.
  - Persist per-branch invocation history under `.git/quest/advise/` (matching
    `.git/quest/review/`); refuse a second call on the same branch without
    `--force`, printing the prior advice timestamp and model.
- **Telemetry & usage (`src/core/record.ts`, `src/cli/records.ts`, `src/cli/send.ts`, `src/cli/usage.ts`):**
  - Add `"advising"` to `Role` and `SKILL_ROLES` (`"quest-advise": "advising"`).
  - Queue each `quest advise` session with its branch, PR, and `role: "advising"`
    (just as `quest review` queues review sessions via `src/cli/send.ts`), and
    surface advising invocation counts and spend in `quest usage`.
- **Skills (`assets/skills/advise.md`, `assets/skills/review.md`, `assets/skills/iterate.md`, `assets/AGENTS.md`):**
  - Ship `/quest-advise` (installed by `quest init` like the other skills) with
    generic guidance: call `quest advise` when stuck (such as failing review
    convergence, repeated findings, or non-converging implementation loops),
    not for routine work or infra/environment failures.
  - In `/quest-review` and `/quest-iterate`, note that at `next decide` (or
    repeated findings across rounds) the agent may run `quest advise` once before
    handing back to the user, auto-applying advice that stays within the quest's
    Goal and settled decisions (`Design change:` PR comment + `quest review --new`)
    and handing back with the advisor's options when it recommends a scope or
    architecture pivot or dropping the PR.

Tests: unit tests for `ADVISORS` fall-through (missing/logged-out/limited),
hard 1-call-per-branch cap and `--force` override, read-only invocation flags
for `agy`/`codex`/`claude`, `"advising"` role attribution and spend rollup in
`quest usage` / `records`, and `quest init` installing the `/quest-advise` stub.
Add an `advise` sandbox case alongside `just review-sandbox` verifying no write
or untrusted code execution.

## Related

- [Routine advisor A/B](/quest/m0/advisor-arms.md) - routine Claude `--advisor`
  pairing and writer A/B arms across T-shirt sizes
- [Routing evidence](/quest/m0/routing-evidence/README.md) - measures rework,
  spend, and escapes across routing choices
- [Model check](/quest/m1/model-check.md) - audits shipped model tables each
  milestone
