# [S] Merge picks offer "Explain it first" and "Are you sure?"

## Goal

The merge-pick question `/quest-run` and `/quest-complete` ask about each PR offers "Explain it first" and "Are you sure?" beside the recommended action, in place of fixed skip and `/quest-delete` options. Skip or delete is an option only when it is the recommendation; otherwise the user types it under Other. "Explain it first" walks the user through the PR's change and open choices, then asks again. "Are you sure?" has a fresh sub-agent judge the PR, then asks again with its finding.

Non-goals: other decision prompts, such as grill rounds, plan questions, and follow-up questions; the harness's question tool, which takes 2-4 options plus Other.

## Plan

Decided 2026-11-17 (maintainer, `/quest-plan`), from the maintainer's answers to agents' blocking questions since 2026-10-15 (`quest messages --json` on the desktop, fedora, and kixtop hosts: 16,237 answers; nixos's run failed on an old Codex rollout):

- On the 4,527 merge-pick questions, the maintainer picked merge 84% of the time, iterate or a similar action 8%, skip 3.0%, and delete 0.5%. They typed an answer 3.9% of the time, and about half of those typed answers were questions such as "is this worth it?", "why is this needed?", or "is this the right approach?". 111 of the 161 skip or delete picks were the agent's own recommendation.
- Where a prompt offered a walk-through, the maintainer took it 14 times in 22, including "Walk me through them" 11 times in about 15, often over a recommended "Accept all". Verify- or investigate-first options were taken 9 times in 27.
- Scope? ✅ merge-pick prompts only, with skip or delete offered only as the recommendation (rejected: every decision prompt, where 2-3 real choices already fill the 4-option limit; dropping skip and delete as options even when recommended, since most of their picks were the recommendation).
- What re-checks on "Are you sure?" ✅ a fresh sub-agent given the PR, its reviews, and threads, but not the coordinator's recommendation, asked whether to merge, iterate, or drop it and why. It runs in the background like any dispatched work, and the PR is asked again once it reports (rejected: the coordinator re-checking inline, which stays anchored on its own call; a new `/quest-review` round, which re-reviews the code rather than the merge call).
- The change belongs in `assets/skills/run.md`'s Pull requests part, whose pick question `/quest-complete` reuses. This quest authorizes that edit, which `AGENTS.md` otherwise protects.

Recommendation for the implementer: after "Explain it first", ask again without that option; after "Are you sure?", ask again with the sub-agent's verdict beside the original recommendation, saying where they differ.
