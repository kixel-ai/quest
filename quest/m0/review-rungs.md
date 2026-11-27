# [M] Review rung ladder on Codex and Claude

## Goal

Replace `quest review`'s flat `0/1/2` risk-tier seating with a single 7-rung
reviewer ladder indexed by `size + risk` (`XS=1`, `S=2`, `M=3`, `L=4`, `XL=5`,
shifted by `low=-1`, `medium=0`, `high=+1` → rungs `0`–`6`), so every `low` PR
gets a local Sol review (retiring `passed with no local reviewer`), `sol("low")`
is dropped, and higher rungs step up effort and cross-vendor Opus coverage:

| Rung | `(size, risk)` cells | Reviewers (this quest; Neon joins rungs 5–6 next) |
|---|---|---|
| `0` | `XS low` | Sol `medium` |
| `1` | `XS med`, `S low` | Sol `high` |
| `2` | `XS high`, `S med`, `M low` | Sol `xhigh` |
| `3` | `S high`, `M med`, `L low` | Sol `xhigh` + Opus `medium` |
| `4` | `M high`, `L med`, `XL low` | Sol `xhigh` + Opus `high` |
| `5` | `L high`, `XL med` | Sol `xhigh` + Opus `high` (+ Neon `medium` in [Neon third reviewer](/quest/m0/review-third-seat.md)) |
| `6` | `XL high` | Sol `xhigh` + Opus `xhigh` (+ Neon `high` in [Neon third reviewer](/quest/m0/review-third-seat.md)) |

PRs in `low` `## Automatic` classes still land without a maintainer pick once
their local review passes with zero findings.

Non-goals: adding the 3rd Neon seat (owned by
[Neon third reviewer](/quest/m0/review-third-seat.md)); changing CI gates,
writer routing, or per-repository model configuration.

## Plan

Decided 2026-11-27 (maintainer, `/quest-plan`, following an audit of 532 saved
review sessions across 5 repositories since Nov 22, 22 recent `## Caused by`
culprits, and 28 live Sol/Opus replays):

- Goal? ✅ Replace `0/1/2` with a `(size + risk)` reviewer ladder with Sol on
  every `low` PR, Sol + Opus on mid rungs, and Neon via `agy` on top rungs
  (rejected: 2 seats max without Neon; drop).
- Ladder shape? ✅ Pure 7-rung 1D ladder (`XS=1`…`XL=5`, `low=-1`, `medium=0`,
  `high=+1` → rungs `0`–`6`) with zero special cases, so `XS high` steps up to
  Sol `xhigh` instead of adding Opus on tiny diffs, `S med` gets Sol `xhigh`,
  and `L/XL low` get 2 seats (rejected: 15-cell 2D matrix; clamping `low` to 1
  seat and `high` to ≥2 seats; Neon only on `high`).
- `low` PRs and auto-merge? ✅ Review every `low` PR with Sol and drop the
  `passed with no local reviewer` / `no-local-review` path; `## Automatic`
  classes still auto-merge once Sol passes cleanly (rejected: keep `quest`-class
  plan deletions unreviewed).
- Effort cells? ✅ Rungs `0`–`6` as tabulated above, dropping `sol("low")`
  everywhere (rejected: Opus `high` on `M med`; Sol `xhigh` on every `medium`
  and `high` PR).

The maintainer authorized the edits this needs in `assets/skills/review.md`,
`assets/skills/merge.md`, `assets/skills/run.md`, `assets/skills/afk.md`,
`RISK.md`, and `README.md`.

Recommended, for the implementer to confirm:

- `src/cli/models.ts`: define `REVIEW_RUNGS` (rungs `0`–`6`, each listing its
  ordered seats) and `reviewRung(size, tier)` returning the rung index
  (`sizeIndex + tierOffset`). Keep fallback when the pick cannot run on a
  1-seat rung (falling from Sol to Opus at matching effort); on a 2-seat rung,
  both seats are required and fail as an outage if either cannot run, matching
  today's `high` behavior.
- `src/cli/review.ts`:
  - Remove the `risk.tier === "low"` short-circuit that skips local reviewers
    (lines 2563–2578) and `nextStep`'s `"the head is low risk, so no local
    reviewer ran"` branch.
  - Select seats from `reviewRung(sized.size, risk.tier)` instead of
    `risk.tier === "high"`. Check `--accept` against the rung's required seats
    (requiring the second seat's round whenever the rung seats two reviewers,
    not only when `risk.tier === "high"`).
  - Keep `second` settling any open findings if a later head drops to a 1-seat
    rung, just as `unsettledSecond` does today.
- `src/core/reviews.ts`, `src/cli/review-record.ts`, `src/github/status.ts`,
  `src/cli/main.ts`, `README.md`, and `assets/skills/{review,merge,run,afk}.md`:
  update documentation and `quest status` / `/quest-merge` / `/quest-run` /
  `/quest-afk` wording so `low` PRs require a passing local review (and
  `## Automatic` classes auto-merge once that review passes). Keep
  `"passed with no local reviewer"` readable in `src/core/reviews.ts` only if
  needed for already-stored Kixel Quest records, or drop it cleanly if
  `kixel.quest` no longer replays old payloads.

Tests: unit tests for `reviewRung(size, tier)` across all 15 `(size, tier)`
pairs, 1-seat vs 2-seat scheduling (including `XS high` = 1 seat Sol `xhigh`,
`S med` = 1 seat Sol `xhigh`, `M med` = 2 seats, `L low` = 2 seats, `XS low` =
1 seat Sol `medium`), `--accept` requiring all rung seats, `low` PRs running
Sol instead of skipping review, and `unsettledSecond` when a branch drops from
a 2-seat rung to a 1-seat rung.

## Related

- [Neon third reviewer](/quest/m0/review-third-seat.md) - adds Neon on rungs
  5–6
- [Routing evidence](/quest/m0/routing-evidence/README.md) - tracks per-rung
  findings, fix rate, spend, and escapes
