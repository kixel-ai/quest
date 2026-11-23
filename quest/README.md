# Quests

## Goal

Make Quest a generic way for any repository and user to plan and
coordinate work through versioned Markdown, with a standalone CLI.

Non-goal: the server-coupled factory tooling and personal workflow, which
kixel-ai/kixel.quest and kixel-ai/dotfiles take over.

## Plan

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
