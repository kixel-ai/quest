# [M] Raise the decision bar, delete afk merge, and make writers adversarial in review

## Goal

Tighten Quest's shipped rules and skills so agents stop making silent unilateral decisions, stop lowering merge thresholds while the maintainer is away, and stop churning on low-value review findings:

- **Delete `afk merge`.** `/quest-afk` takes zero unilateral decisions, zero `--accept`s, and zero merges; it only keeps already-authorized non-decision work moving (starting ready quests, fixing CI/conflicts/clear defects, running reviews and rung escalations) and queues every decision and merge pick for the maintainer's return.
- **Tiered decision gate (no silent consequential choices, no numeric caps).** Consequential decisions — public API, wire, or schema changes, scope changes, dropping or deferring requirements, accepting a review finding (`--accept`), deleting or deprioritizing a quest, or picking between competing architectures/trade-offs — must block as structured `## Waiting` items asked individually. Minor local implementation choices carry no count cap, are recorded under `## Decisions`, and must all be surfaced inline at the merge pick (never "I made 10 decisions, check the PR").
- **Higher review signal and adversarial writers (no caps on findings or rounds).** Tighten `assets/REVIEW.md` and `SEVERITY` in `src/cli/review.ts` so blocking findings must name a concrete, realistic failure path or wrong direction (excluding speculative multi-failure edge cases and settled quest Plan decisions). Update `assets/skills/review.md` so writers push back adversarially and refute findings they disagree with rather than patching around low-value nits; unresolved disagreements stall the PR for rung escalation or maintainer arbitration.

Non-goals: CLI enforcement of score-progress/dispute stalling and rung step-up ([Score-progress and dispute stall detection](/quest/m0/advise-stop.md)), manual `/quest-advise` prompt changes ([Make quest advise manual](/quest/m0/advise.md)), and structured decision/audit telemetry ([Decision and agreement telemetry](/quest/m0/telemetry/decisions.md), [Post-hoc frontier PR audits](/quest/m0/audit-pr.md)).

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` raising the bar after the 2026-11-23–28 decision/review audit and [moq-dev/moq#9860](https://github.com/moq-dev/moq/pull/9860)):

- Goal? ✅ Confirm full bar-raising package: rules + decision surfacing + delete `afk merge` + rung escalation A/B + post-hoc frontier audits & agreement metrics (rejected: rules, gates, and rung escalation only; drop).
- Decision surfacing & `afk`? ✅ Tiered gate: consequential decisions block in `## Waiting` asked individually; minor local choices have no arbitrary numeric cap and are all shown inline at merge pick; delete `afk merge` and have `afk` take zero decisions or merges (rejected: strict gate blocking every non-plan choice; deleting `/quest-afk` completely; keeping a `<=3` numeric cap on minor choices).
- Review noise & caps? ✅ Avoid capping anything (findings, rounds, choices); tighten `REVIEW.md`/`SEVERITY` to focus on important findings; instruct writers to be adversarial and refute findings they disagree with so disagreements stall the PR for higher-rung review or human intervention (rejected: capping blocking findings at 3–5/round; prompt-only while keeping writer obedience; hard 2-round cap per rung).

Why: across 6 repositories from Nov 25–28, 43% of reviewed branches hit 3+ rounds (17% hit 8+), 90 single rounds raised 5–15 findings, Opus had a 23–25% refutation rate, 21 local review findings were accepted under `afk` (*"not the maintainer's answer"*), and 21 of 100 audited `moq-dev/moq` PRs had verified pre-0.22 issues from bypassed design gates and silent choices buried in PR bodies.

This decision explicitly authorizes the edits needed in `assets/AGENTS.md`, `assets/CONTEXT.md`, `assets/REVIEW.md`, `assets/skills/afk.md`, `assets/skills/review.md`, `assets/skills/iterate.md`, `assets/skills/run.md`, `assets/skills/merge.md`, `src/cli/review.ts`, and `README.md`. Follow `quest guide prompting`: consolidate or delete rules rather than bloating always-loaded context, and keep `assets/CONTEXT.md` under Claude Code's 10,000-character hook budget.

Recommended, for the implementer to confirm:

- **`assets/skills/afk.md`:** Delete `afk merge` and its low/medium merge and inline-follow-up rules. Remove *"Take every decision a later PR review can still undo"* and *"dispatch `/quest-iterate` on a PR with open decisions, with your recommended answers"*. Keep plain `afk` and `afk soon` strictly non-decisional: start ready quests, fix CI/conflicts/clear review defects, run reviews, and queue every open decision, `--accept`, and merge pick for the maintainer's return.
- **`assets/AGENTS.md` & `assets/skills/run.md` & `assets/skills/merge.md`:**
  - Replace `assets/AGENTS.md`'s *"even if you made choices without asking; list those choices in the PR body for review"* with the tiered decision gate: consequential choices block as structured `## Waiting` items (asked individually); minor local choices live under `## Decisions` with no count cap.
  - Update `/quest-run` and `/quest-merge` pick prompts so every unasked choice recorded in a PR's `## Decisions` is displayed inline in the pick prompt (never summarized away as "made N decisions, check the PR").
- **`assets/REVIEW.md`, `src/cli/review.ts` (`SEVERITY`), & `assets/skills/review.md`:**
  - Tighten `SEVERITY` in `src/cli/review.ts` to match `assets/REVIEW.md`'s high bar: `medium` is a real bug or wrong direction someone will hit, not *"a case you can name that happens less often"*; speculative/multi-failure scenarios and challenges to settled quest Plan decisions are never blocking findings.
  - Replace `assets/skills/review.md`'s *"make that fix, the smallest that settles it, unless you refute the finding. Do not answer a finding with a design of your own"* with adversarial pushback: evaluate every finding critically, refute any finding that is speculative, defensive bloat, contradicts a settled Plan decision, or pushes a worse design, and let unresolved disagreements stall the PR rather than patching around them.
- Check `test/skills.test.ts` and `test/review.test.ts` for any assertions on deleted `afk merge` or old `review.md` / `SEVERITY` wording.

Tests: unit/prompt tests covering `afk.md` having no `afk merge` or unilateral decision-taking, `AGENTS.md` / `run.md` requiring inline surfacing of decisions and `## Waiting` for consequential calls, `REVIEW.md` / `SEVERITY` / `review.md` reflecting adversarial refutation with no numeric caps, and `CONTEXT.md` staying under 10,000 characters.

## Related

- [Make quest advise manual](/quest/m0/advise.md) - strips automatic advisor triggers and adds `/quest-advise` to decision prompts
- [Score-progress and dispute stall detection](/quest/m0/advise-stop.md) - enforces stalling on score stagnation and unresolved disputes
- [Decision and agreement telemetry](/quest/m0/telemetry/decisions.md) - tracks agreement on every surfaced decision and merge pick
