# [M] Add Neon and Astra to top review rungs and never lower rungs

## Goal

Extend `REVIEW_RUNGS` with `gemini-4-neon` (`agy`) and `gpt-6.2-astra` (`codex`) on the top and escalation rungs of the reviewer ladder — reusing `quest advise`'s read-only `agy` runner and failing loud as an outage when any required seat cannot run — and enforce that a PR's rung never lowers mid-PR across heads or reclassifications:

- **Rung 5 (`L high`, `XL med`):** Sol `xhigh` + Opus `high` + Neon `medium` (3 seats)
- **Rung 6 (`XL high`):** Astra `high` + Opus `xhigh` + Neon `high` (3 seats)
- **Rung 7 (stall escalation above rung 6):** Astra `high` + Neon `high` + Opus `xhigh` (3 seats, selectable by rung escalation or `--rung 7`)

Non-goals: using `agy`/Neon or Astra for writers, risk classification, or initial rungs `0`–`4`; degrading silently to fewer seats when a required seat is unavailable; lowering rungs on any PR.

## Plan

Decided 2026-11-27 (maintainer, `/quest-plan`):

- Goal? ✅ Add Neon via `agy` as the 3rd reviewer on rungs `5` (`Neon medium`)
  and `6` (`Neon high`) of the `(size + risk)` ladder (rejected:
  2 reviewers max without Neon; Neon only on `high` so `XL med` stays 2 seats).
- Outage behavior when `agy` is missing, logged out, at its limit, or
  unsupported on the host (such as macOS's default case-insensitive
  filesystem)? ✅ Fail as an outage, matching how multi-seat rungs fail when
  Sol or Opus cannot run; `--harness` still lets a person override manually
  (rejected: degrade to 2 seats with a warning; fall through to Fable or Astra).

Amended 2026-11-28 (maintainer, `/quest-plan` raising the bar):

- Astra & escalation rung? ✅ Include `gpt-6.2-astra` (`high` via `codex`) on top/escalation rungs — rung 5: Sol `xhigh` + Opus `high` + Neon `medium`; rung 6: Astra `high` + Opus `xhigh` + Neon `high`; rung 7 (escalation above 6): Astra `high` + Neon `high` + Opus `xhigh` — and enforce that a PR's rung never lowers mid-PR across heads or reclassifications (rejected: replacing Sol with Astra on rung 5 too; no separate rung 7; keeping `second-seat-ablation` active).

The maintainer authorized the edits this needs in `assets/skills/review.md`,
`assets/skills/merge.md`, `assets/skills/run.md`, and `README.md`.

Recommended, for the implementer to confirm:

- `src/core/reviews.ts`: `"third"` is already in `SEATS` without sending any
  `"third"` rounds yet. Checked 2026-11-28: kixel.quest pins `quest` at
  `a8b9e776d`, whose `SEATS` includes `"third"`, and has deployed it since, so
  clients may post `seat: "third"`.
- `src/cli/models.ts`:
  - Add `astra = (effort: string): Model => ({ harness: "codex", model: "gpt-6.2-astra", effort })` and `agy = (model: string, effort: string): Model => ({ harness: "agy", model, effort })`.
  - Update `REVIEW_RUNGS` for rungs `5` (`[sol("xhigh"), opus("high"), agy("gemini-4-neon", "medium")]`), `6` (`[astra("high"), opus("xhigh"), agy("gemini-4-neon", "high")]`), and escalation rung `7` (`[astra("high"), agy("gemini-4-neon", "high"), opus("xhigh")]`, or document clearly how rung `7` adds a step above `6` — note: if rung 6 and rung 7 would otherwise run the same 3 models, differentiate rung 6 vs 7 cleanly during implementation, e.g., rung 6 = `Sol xhigh + Opus xhigh + Neon high` and rung 7 = `Astra high + Neon high + Opus xhigh`, or rung 7 bumping Astra to `xhigh` — confirm against current Codex/Astra supported efforts before finalizing).
  - Support `seats: 1 | 2 | 3` and explicit `--rung <0..7>` / floor rung clamping so `effectiveRung = Math.max(reviewRungIndex(size, tier), previousMaxRung)`.
- `src/cli/review.ts` & `src/cli/agent.ts`:
  - Reuse the read-only `agy` turn runner, deny rules, limit parsing,
    case-insensitive volume refusal, and persisted API-list pricing restored by
    [kixel-ai/quest#993](https://github.com/kixel-ai/quest/pull/993) for `quest advise` (instead of duplicating harness plumbing); its `agy`
    reviewer refuses `review` and `resume` turns today, so this adds them,
    with `quest review`'s queueing of `agy` sessions' tokens as `quest advise`
    queues them.
  - Generalize `SeatId` / `Session` / `Tally` / `Round` from `second?: true` to
    `seat: "pick" | "second" | "third"` so findings number cleanly across all 3 seats, all 3 seats run in
    parallel under `runSeats`, `--accept` requires every seat on the rung, and
    any open findings on `third` are settled.
  - Record the highest rung run on the branch so a later head that classifies at a lower tier or size stays at the PR's highest rung and never lowers.
  - When `agy` or `codex` (Astra) cannot run (missing CLI, logged out, usage limit, or unsupported
    case-insensitive filesystem), fail the run as a `ReviewOutageError` naming
    the reason rather than dropping a seat.
- `src/cli/usage.ts`: surface `third`-seat tallies, Astra spend, and `agy` API-list spend
  alongside `pick` and `second`.

Tests: unit tests for 3-seat scheduling on rungs `5`–`7`, Astra + Neon model selection, monotonic rung floor (a later lower-tier head never drops below a PR's prior rung), finding numbering
and settlement across 3 seats, outage failure when `agy` is unavailable or on a
case-insensitive filesystem, `--accept` requiring all 3 seats on rungs `5`–`7`,
`parseReviews` accepting `seat: "third"`, and `just review-sandbox` covering
`agy`'s read-only review invocation.

## Related

- [Score-progress and dispute stall detection](/quest/m0/advise-stop.md) - steps PRs up this ladder on stall
- [Routing evidence](/quest/m0/routing-evidence/README.md) - tracks per-rung
  findings, fix rate, spend, and escapes
