# [M] Rung-escalation A/B test on stalled PRs

## Goal

When a PR stalls in review (no score progress or an unresolved writer/reviewer dispute, as [Score-progress and dispute stall detection](/quest/m0/advise-stop.md) detects), deterministically split PRs between two arms — Arm A steps up `+1` rung on the unified reviewer ladder (up to rung 7: Astra `high` + Neon `high` + Opus `xhigh`) and re-reviews, while Arm B hands the stalled PR straight back to the maintainer — and record the arm, starting rung, and escalation rung in posted review runs so `quest usage` and Kixel Quest measure maintainer agreement rate, post-hoc 0–10 audit scores, 7-day escapes, review rounds, and total cost per merged PR to determine when stepping up review strength unsticks bad decisions cost-effectively.

Non-goals: automatic `quest advise` calls (advisor is manual per [Make quest advise manual](/quest/m0/advise.md)); lowering rungs below a PR's starting rung; running an A/B on round numbers (superseded 2026-11-28).

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` raising the bar):

- Escalation design? ✅ Unified rung ladder (step up `+1` rung on stall, up to frontier rung 7 with Astra + Neon + Opus) + A/B test step-up escalation against handing straight to the maintainer on stall, measuring agreement, 0–10 audit scores, 7-day escapes, and cost (rejected: jumping straight to Neon on every stall; stepping through every rung without a frontier top rung; separate automatic `quest advise` trigger A/B).
- Superseded quests? ✅ Deleted `quest/m0/advise-replay.md` and `quest/m1/advise-trigger.md`; this live A/B plus [Post-hoc frontier PR audits](/quest/m0/audit-pr.md) replace them.

Agent's choices, for the implementer to revisit:

- Draw the arm per PR from a salted hash `sha256("rung-escalation:" + owner/repo + "#" + pr)` so it stays independent of writer A/B arms and stable across heads, sessions, and hosts. Enroll a PR only when it first hits a stall; PRs that converge cleanly never enter either arm.
- Record the experiment cohort, arm (`A` = step-up, `B` = handback), starting rung, and escalated rung in the posted review run (`src/core/reviews.ts`), following `telemetry/README.md`'s schema-first order so Kixel Quest accepts the fields before clients send them.
- In Arm A, stepping up `+1` rung runs the stronger rung's seats on the stalled head (never lowering any seat already run). If the escalated rung still stalls or leaves a dispute open, hand back to the maintainer with the escalated rung's findings and a `/quest-advise` option.
- In Arm B, a stall hands straight back to the maintainer with the open findings/dispute and a `/quest-advise` option.
- Report per-arm and per-starting-rung tallies in `quest usage`: stalled PR count, share resolved without maintainer intervention, maintainer agreement rate (once [Decision and agreement telemetry](/quest/m0/telemetry/decisions.md) lands), post-hoc 0–10 audit scores (from [Post-hoc frontier PR audits](/quest/m0/audit-pr.md)), 7-day escapes (`escaped["7"]`), review rounds, and mean cost per merged PR (including rework/fixes).

Tests: deterministic per-PR arm draw independent of head/host changes; Arm A steps up `+1` rung on first stall and hands back if the escalated rung stalls; Arm B hands back immediately on first stall; clean non-stalling PRs are not enrolled; `quest usage` aggregates per-arm and per-starting-rung outcomes and spend.

## Required

- [Score-progress and dispute stall detection](/quest/m0/advise-stop.md) - detects stalls across sessions/hosts and implements rung step-up

## Related

- [Post-hoc frontier PR audits](/quest/m0/audit-pr.md) - supplies 0–10 decision and finding scores for the readout
- [Decision and agreement telemetry](/quest/m0/telemetry/decisions.md) - supplies maintainer agreement rates for the readout
- [Routing evidence](/quest/m0/routing-evidence/README.md) - tracks experiments and readouts
