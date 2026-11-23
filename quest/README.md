# Quests

## Goal

Make Quest the public binary through which any repository and user plan and
coordinate work through versioned Markdown, posting every session's
telemetry to kixel.quest.

Non-goals: storage, dashboards, and the merge queue, which
kixel-ai/kixel.quest owns; repository- or user-level model settings.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` in
[kixel-ai/kixel.quest#104](https://github.com/kixel-ai/kixel.quest/pull/104)),
reversing both decisions below on where tooling lives: ✅ "`quest` is public.
… quest is the public binary that contributors and maintainers run that
posts metrics to kixel.quest, which is a public website and dashboard. We're
focusing on metrics first but the idea is to move spawning/workers/etc to
kixel.quest eventually" (rejected: a `kixel-quest` binary; a generic Quest
with no kixel.quest references). `records`, `eval`, `agent`, `worktree`,
`gate`, and model routing stay here, and [telemetry](/quest/m0/telemetry/README.md)
plans the posts. ✅ "Leave quest public and don't make it too extensible.
Like we should just ship the allowed models per effort level; don't fuck
around with letting repos configure any special settings": Quest ships one
order of models and efforts per quest size and nobody configures it. Claude,
Codex, then Gemini write; Codex, Gemini, then Claude review; "T-shirt size
determines model/effort, while risk determines number of reviewers"
(rejected: a user ranking within shipped lists, which deletes
`quest/m1/model-config.md`; lists per reasoning effort; Claude-only
writers).

Decided 2026-11-21 (maintainer, `/quest-plan` in
[kixel-ai/kixel.quest#85](https://github.com/kixel-ai/kixel.quest/pull/85)),
reversing the 2026-11-13 decision below: moq-dev/quest stays a clean,
generic public tool, keeping the quest-tree contract, the GitHub PR
workflow, a forge read client at a configurable URL, and harness-agnostic
skills with no kixel.quest references (rejected: GitHub-only with no
configurable forge URL; stripping the GitHub PR commands). `records`,
breakage, `eval`, risk tiers and guardrails, `agent`, `worktree`, `gate`,
model routing, and `land` move to kixel.quest, and review pairing, model
rankings, and local hooks to dotfiles.

Amended 2026-11-22 (maintainer, in the session that planned
[moq-dev/quest#826](https://github.com/moq-dev/quest/pull/826)): model
routing splits rather than moving out. ✅ For each quest size, Quest lists
the writer and reviewer models it accepts, each at a minimum effort, and
the user's config ranks and picks among them, Quest refusing a model off
the list (rejected: lists per reasoning effort, with sizes mapped in
config, which lets a weak model take an XL quest; moving routing out
entirely). The size tables in `src/cli/models.ts` and the writer A/B arms
become the maintainer's config.

Decided 2026-11-13 (user, /quest-plan, unprompted, while planning
[the benchmark](/quest/m0/benchmark/README.md)): "I'm fine dropping quest
as a generic solution for now. The binary needs to runnable by
contributors, but it's a non-goal to have them use their own (non-fork)
repos". The Goal read "a reusable way to plan and coordinate repository
work... with a reversible adoption path" until then. m1's public-release
quests predate this, so [this tree's first `tree` audit](/quest/m1/audit-tree.md)
checks them first.

`m0` is adoption on moq-dev's own repositories, `m1` the public release,
and `m2` later work. Add later horizons when concrete work warrants them,
keeping milestone numbers stable as earlier milestones complete.
