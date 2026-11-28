# [M] Decision and maintainer-agreement telemetry

## Goal

Record every agent decision and its maintainer-agreement outcome — covering plans, writer/reviewer/advisor/coordinator choices, `--accept` requests, and merge picks — attributed to harness, model, effort, and A/B arm/cohort, keeping the human-readable paper trail in GitHub PRs (`## Decisions`, `## Waiting`, and pick comments) while posting structured decision and agreement records to Kixel Quest's immutable R2 raw log via strict `quest/core` wire schemas, and reporting agreement rates by model, effort, arm, and category in `quest usage` so gates are removed only once calibrated thresholds prove safe.

Non-goals: server storage, Durable Object views, and `/factory` dashboards (owned by `kixel-ai/kixel.quest`); automatically lowering or removing any gate without maintainer sign-off.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` raising the bar):

- Storage & paper trail? ✅ GitHub PRs keep the human-readable paper trail of surfaced decisions, and `quest` posts structured decision and agreement events (for everything, including merges) into Kixel Quest's immutable R2 raw log via `quest/core` wire schemas (rejected: `kixel.quest` only without a GitHub paper trail; deferring `kixel.quest` ingestion until `d1-exit` and `routing-view` finish).
- Attribution? ✅ Every decision is attributed to its proposing actor (role, harness, model, effort, A/B arm/cohort), category (plan, architecture, public-api/wire, scope, review-dispute, review-accept, follow-up, merge-pick, local-choice), whether it was surfaced for approval or made unasked, and its observed outcome (agreed with recommendation, picked another option, typed override, reworked/iterated, or later reverted / named under `## Caused by`).

Follow the [telemetry epic](/quest/m0/telemetry/README.md)'s server-first wire order: land the `DecisionRecord` / `DecisionUpload` schemas and strict parsers in `quest/core` first (so `kixel-ai/kixel.quest` can pin them and deploy `POST /decisions`), then enable posting from `quest` once the server endpoint is live.

Agent's choices, for the implementer to revisit:

- **Wire schema (`src/core/decisions.ts`, exported from `quest/core`):**
  - Strictly validate every field (matching `src/core/reviews.ts` and `kixel.quest`'s `src/schema.ts` style): repository, PR number (or quest path for plan decisions), stable decision ID, timestamp, category, actor (`role`, `harness`, `model`, `effort`, `arm`, `cohort`, `session`), `surfaced` (`asked` | `inline-pick` | `unflagged`), `recommended` summary/label, and `outcome` (`agreed` | `overridden` | `reworked` | `reverted` | `pending`, with source: `cli-prompt` | `kixel-inbox` | `merge-pick` | `post-merge`).
- **Capture points in `quest`:**
  - Extend `quest messages` / `quest send` to extract asked prompt outcomes (`kind: "answer"` — skill, category, recommended vs. picked, session model/effort) and post them as decision records.
  - Capture merge picks in `quest merge` / `/quest-merge` (whether the maintainer agreed with the merge recommendation, picked `/quest-advise`, skipped, or deleted; and whether a PR that auto-merged later escaped or reverted).
  - Capture `quest review --accept` and stall escalations with the proposing model/seat and whether the maintainer agreed.
  - Parse structured `## Decisions` bullets from PR bodies so unasked local choices are linked to the PR's writer model/effort and cross-referenced with [Post-hoc frontier PR audits](/quest/m0/audit-pr.md).
- **`quest usage` readout:** add a `decisions` rollup (agreement rate, count, surfaced vs. unflagged share, override rate) grouped by category, role, model, effort, and arm.

Tests: strict `quest/core` parser rejects malformed/extra fields and accepts valid decision/agreement uploads; `quest send` queues and posts decision records (retrying on 5xx, matching existing queue behavior); `quest usage --json` reports agreement rates by category, model, effort, and arm; merge picks and `--accept` outcomes link cleanly to their proposing session.

## Waiting

- kixel-ai/kixel.quest: server endpoint (`POST /decisions`) and R2 raw-log derivation accepting the `quest/core` decision schema are deployed (first land the schema-only `quest/core` export PR here, then pin and deploy it in `kixel-ai/kixel.quest`, then land the sender here). Check that `kixel-ai/kixel.quest`'s `src/` routes `POST /decisions`.

## Related

- [Post-hoc frontier PR audits](/quest/m0/audit-pr.md) - rates unflagged and asked decisions 0–10 and detects hidden decisions
- [Raise the decision bar and delete afk merge](/quest/m0/decision-bar-and-afk.md) - defines the tiered decision surfacing rules that produce the paper trail
- [Rung-escalation A/B test](/quest/m0/rung-escalation-ab.md) - uses agreement rates in its readout
