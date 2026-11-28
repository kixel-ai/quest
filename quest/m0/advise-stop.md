# [M] Score-progress and dispute stall detection with rung step-up

## Goal

Replace the fixed round-3 `next decide` cap in `quest review` with progress- and dispute-based stall detection across sessions and hosts — with no hard cap on review rounds or findings:

- Track each review round's score, findings, rung, and dispositions across sessions and hosts (reading posted runs from Kixel Quest, and persisting per-round scores locally under `.git/quest/review/` too).
- Declare a stall whenever a review round still has blocking findings AND either:
  1. **No score progress:** any active seat's score fails to improve over its previous round (`score <= previous_score`), OR
  2. **Unresolved dispute:** a finding the writer refuted in the prior round is kept open by the reviewer.
- On a stall, step the PR up `+1` rung on the unified reviewer ladder (up to rung 7: Astra `high` + Neon `high` + Opus `xhigh`), **never lowering a PR's rung** mid-PR across heads or reclassifications. Once already escalated (or already at rung 7) and stalled again, stop and hand the PR back to the maintainer with a `## Waiting` decision offering `/quest-advise` among its options.
- Refuse every unattested `quest review --accept`: require `QUEST_USER_ASKED=1` (`USER_ASKED` in `src/cli/rules.ts`) so no agent or `afk` coordinator can silently accept open findings without the maintainer's explicit approval.

Non-goals: A/B splitting step-up against immediate handback ([Rung-escalation A/B test](/quest/m0/rung-escalation-ab.md)); defining the Neon/Astra seats on rungs 5–7 ([Add Neon and Astra to top review rungs](/quest/m0/review-third-seat.md)); manual `quest advise` ([Make quest advise manual](/quest/m0/advise.md)).

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` raising the bar — superseding the earlier 2026-11-28 round-3 stop + auto-advisor plan):

- Stall rule? ✅ No caps on review rounds or findings; judge progress by review scores across sessions/hosts plus unresolved writer/reviewer disputes: stall whenever a round with open findings fails to improve score (`score <= previous`) OR keeps a refuted finding open in dispute (rejected: fixed round-3 `next decide` cap; pure score non-improvement ignoring disputes; changing the 0–10 scale to 0–100).
- Escalation on stall? ✅ Step up `+1` rung on the regular reviewer ladder (which includes Neon and Astra on top rungs), never lowering a PR's rung mid-PR, instead of automatic `quest advise`; hand back to the maintainer when already escalated or at the top rung (rejected: automatic `quest advise` at round 3; jumping straight to Neon on every stall).
- `--accept` enforcement? ✅ Require `QUEST_USER_ASKED=1` attestation for every `--accept`; remove the advisor-accept bypass completely (rejected: allowing unattested `--accept` after an advisor verdict).

Why: in the 2026-11-25–28 audit, 65 of 210 `next decide` stops were bypassed (37 kept reviewing across session/host resets, 28 ran `--accept` with no pick), and fixed round-3 stops cut off legitimately converging PRs (e.g., `4 → 6 → 8`) while letting stalled/disputed PRs grind or get accepted under `afk`.

This decision authorizes the edits needed in `assets/skills/review.md`, `assets/skills/iterate.md`, and `README.md`.

Agent's choices, for the implementer to revisit:

- **Cross-session state:** Read the PR's posted review runs from Kixel Quest (via [Usage reviews](/quest/m0/telemetry/usage-reviews.md)) merged with `.git/quest/review/` so session restarts (host changes, base merges, `REVIEW.md` edits, tier rises) never reset the score trajectory, dispute history, or highest rung reached. Persist per-round `score` and `rung` in local `.git/quest/review/` round records as well (today local rounds store only `head`, `mergeBase`, and `findings`).
- **Monotonic rung floor:** Compute the PR's effective rung as `max(reviewRungIndex(size, tier), highestRungEverRunOnPr, escalatedRung)`. Never drop to a lower rung on a later head even if its diff shrinks or reclassifies lower.
- **Multi-seat score progress:** Track per-seat score trajectories across rounds on the same seat/model, and treat any seat with open findings whose score did not strictly increase (`score <= prev`) as stalled.
- **Dispute detection:** When `--responses` refutes finding N and the reviewer's next verdict keeps that finding open (`disposition: "open"`), mark the round as disputed and trigger the stall transition immediately instead of looping.
- **Enforcement:** Once a PR hits a stall that requires maintainer handback, `quest review` refuses further rounds (unless `--rung` override or maintainer attestation `QUEST_USER_ASKED=1` / a new `Design change:` decision clears it) and refuses every unattested `--accept`.

Tests: a converging PR (`5 → 7 → 8 → 10`) runs past 3 rounds without stalling; a flat/regressing score (`7 → 7` or `7 → 6` with findings open) stalls across session/host resets; a writer refutation kept open by the reviewer stalls immediately as a dispute; first stall steps up `+1` rung (never lowering an earlier higher rung); a stall after escalation hands back and refuses further unattested rounds; every unattested `--accept` is refused while an attested one passes.

## Required

- [Add Neon and Astra to top review rungs](/quest/m0/review-third-seat.md) - defines rungs 5–7 with Neon and Astra and enforces rung monotonicity
- [Make quest advise manual](/quest/m0/advise.md) - removes automatic `quest advise` stop wiring
- [Usage reviews](/quest/m0/telemetry/usage-reviews.md) - reads a PR's posted review runs (with scores, rungs, and outcomes) across hosts

## Related

- [Rung-escalation A/B test](/quest/m0/rung-escalation-ab.md) - A/B tests stepping up `+1` rung against immediate maintainer handback on stall
- [Raise the decision bar and delete afk merge](/quest/m0/decision-bar-and-afk.md) - updates `REVIEW.md` and `review.md` for adversarial writers
