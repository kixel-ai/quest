# [L] Manual post-hoc frontier PR audits (0–10 ratings)

## Goal

Add a manual, read-only `quest audit-pr` command that audits merged PRs after the fact using frontier models — alternating `gemini-4-neon` (`high` via `agy`) and `gpt-6.2-astra` (`high` via `codex`) with a ~10% overlap sample to calibrate inter-auditor agreement — and posts structured, attributed 0–10 ratings to Kixel Quest's immutable R2 raw log via a `quest/core` wire schema:

- **Original quest plan quality (0–10):** was the plan clear, well-scoped, and accurate, or did an underspecified/bad plan force the writer to guess?
- **Every decision made (0–10 each):** attributed to the writer, reviewer, advisor, or coordinator (model, effort, arm), recording whether the decision was good, whether it was pressured by a reviewer, whether it was surfaced for approval or hidden, and whether it should have asked the maintainer.
- **Every review finding (0–10 each):** attributed to the reviewer seat (model, effort, rung), distinguishing real defects caught from low-value noise/slop.
- **Overall merge readiness (0–10):** whether the PR should have landed as-is, needed rework, or missed issues later seen in `## Caused by`.

Supports auditing one named PR (`quest audit-pr <pr>`) or a batch of unaudited qualifying merged PRs (`quest audit-pr --since <date>` selecting 100% of `M`/`L`/`XL`, high-risk, 3+-round, or decision-bearing PRs, plus a deterministic 20% sample of `XS`/`S` low/medium PRs).

Non-goals: an automated background host poller/daemon (kept manual for now until calibration proves its value; automating host execution is a future follow-up in `kixel-ai/dotfiles`); blocking merges on audit scores; synthetic throwaway evals (this audits real merged production PRs).

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` raising the bar):

- Coverage? ✅ 100% of non-trivial merged PRs (`M`/`L`/`XL`, any high-risk PR, any PR with 3+ review rounds, stall escalation, or recorded decisions) + deterministic 20% random sample of `XS`/`S` low/medium PRs (rejected: 100% of every merged PR regardless of size; weekly hand-run batch only; pre-merge audit gate).
- Auditor models? ✅ Alternate `gemini-4-neon` (`high` via `agy`) and `gpt-6.2-astra` (`high` via `codex`), with a ~10% overlap sample audited by both to measure inter-auditor agreement (rejected: Neon-only with Astra fallback).
- Execution mode? ✅ Manual `quest audit-pr` CLI command for now ("Let's keep it manual for right now"), posting structured 0–10 records to Kixel Quest's R2 raw log (rejected: always-on host polling daemon now; post-merge merge-queue hook).
- Storage & feedback loop? ✅ `quest/core` strict audit schema posted to Kixel Quest's R2 raw log; Kixel Quest (tracked in `kixel-ai/kixel.quest`) surfaces low-scoring PRs (e.g., any plan or decision `< 6`, or an unflagged consequential decision) in its inbox/digest for calibration review.

Follow `quest/m0/telemetry/README.md`'s server-first order for posting: land `src/core/audits.ts` (wire schema + strict parser) in `quest/core` first so `kixel-ai/kixel.quest` can pin it and deploy `POST /audits`. Meanwhile `quest audit-pr` can run locally, persist its structured audit JSON under `.git/quest/audit-pr/` (matching `.git/quest/advise/`), print a concise human summary, and post to Kixel Quest once the endpoint is live.

Recommended, for the implementer to confirm:

- **Read-only runner:** Reuse `quest advise`'s read-only `agy` and `codex` runners (`src/cli/review.ts` / `src/cli/advise.ts`) against an isolated export of the merged commit and its parent diff, with strict deny rules (no edits, no shell, no network, no reads outside the export).
- **Audit bundle inputs:** For each merged PR, gather:
  - the original quest file as of the PR's base commit (if a quest branch, plus the planning PR/author metadata when available);
  - the merged diff (`merge^1..merge`);
  - the PR body, comments, and `## Decisions` / `## Waiting` / `## Models` records;
  - every review round and finding (from Kixel Quest's posted runs + local `.git/quest/review/` fallback), with each seat's model, effort, rung, and fixed/refuted/accepted disposition;
  - any later PRs naming this PR under `## Caused by` (as ground-truth escapes).
- **Deterministic sampling & auditor assignment:**
  - Qualifying check: `size in {M, L, XL}` OR `tier == "high"` OR `rounds >= 3` OR `stalled` OR has decisions/accepts; else `sha256("audit-sample:" + repo + "#" + pr)` mod 100 < 20.
  - Auditor selection: `sha256("audit-model:" + repo + "#" + pr)`: ~45% Neon `high`, ~45% Astra `high`, ~10% both (overlap sample). `--harness`/`--model`/`--effort` overrides for manual ad-hoc runs. Fall through to the other frontier model only on outage/limit, recording the fall-through.
- **Telemetry & spend:** Queue audit sessions with a dedicated role (`"auditing"` added to `ROLES` in `src/core/record.ts` and `kixel.quest`'s `src/schema.ts`, with `agy` API-list token pricing as `quest advise` does) so audit spend is tracked separately from writing and reviewing in `quest usage`.
- **Wire schema (`src/core/audits.ts`):** Strict parser for `AuditRecord` containing PR identity, audited merge SHA, auditor (`harness`, `model`, `effort`, `session`), `plan` (`score: 0..10`, `rationale`, `authorModel?`), `decisions[]` (`summary`, `score: 0..10`, `actor`, `surfaced`, `pressuredByReviewer`, `shouldHaveAsked`, `rationale`), `findings[]` (`roundId?`, `findingIndex?`, `reviewer`, `score: 0..10`, `category: "real" | "minor" | "noise" | "wrong"`, `rationale`), and `overall` (`score: 0..10`, `rationale`, `flagForCalibration: boolean`).

Tests: deterministic qualifying filter (100% non-trivial, ~20% XS/S) and auditor assignment (~45/45/10 overlap); strict `parseAudit` rejects out-of-range scores or extra fields; read-only sandbox test alongside `just review-sandbox` for both `agy` and `codex` audit invocations; `quest audit-pr` persists locally, attributes spend under `auditing`, and posts to a fake Kixel Quest endpoint.

## Related

- [Decision and agreement telemetry](/quest/m0/telemetry/decisions.md) - correlates post-hoc audit scores with maintainer agreement rates
- [Rung-escalation A/B test](/quest/m0/rung-escalation-ab.md) - uses 0–10 audit scores to judge whether rung escalation improves decision quality
- [Routing evidence](/quest/m0/routing-evidence/README.md) - tracks model/effort quality per dollar
