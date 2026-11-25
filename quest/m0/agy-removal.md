# [S] Remove Antigravity from quest

## Goal

Quest runs Claude and Codex only. `quest review --harness agy` is gone, the
risk classifier falls from Claude to Codex and no further, and no code, test,
doc, or shipped instruction mentions `agy`, Antigravity, or Gemini except where
a recorded decision names them.

## Plan

Decided 2026-11-25 (maintainer, closing
[kixel-ai/quest#898](https://github.com/kixel-ai/quest/pull/898) and
[kixel-ai/quest#891](https://github.com/kixel-ai/quest/pull/891)): ✅ "keep it
simple. Claude writes, codex+claude reviews", so remove agy entirely (rejected:
keep agy as an opt-in reviewer). The quests that built on it (agy sandbox, agy
hardening, agy usage) were deleted with this decision. The maintainer
authorizes the edits this needs in `assets/AGENTS.md` and `assets/audits/`.

- `src/cli/agent.ts`: drop `REVIEW_HARNESSES`' agy entry and `agyTurn` with
  its export, deny rules, and case-insensitive volume refusal.
- `src/cli/models.ts`: drop the classifier's `gemini-3.8-flash` rung.
- `src/cli/limit.ts`, `usage.ts`, `models-record.ts`, `review-record.ts`,
  `review.ts`, and `main.ts`: drop agy's limit parsing, seats, record fields,
  and help text.
- The README's Antigravity sections, `just review-sandbox -t agy`, and agy's
  cases in `test/` and `test/live/review-sandbox.test.ts`.
- [Review hidden diff](/quest/m0/review-hidden-diff.md) names agy's diffs; drop
  those parts. [kixel-ai/quest#885](https://github.com/kixel-ai/quest/pull/885)
  fixes the classifier's attributes for Claude and Codex only, so agy's
  classifier turn reads no scratch file for a diff past the prompt; land after
  it or merge its changes.

A records or review-record field agy used goes away with no migration, as
AGENTS.md allows while nothing is in production.

Tests: `just check` and `just test` pass, and `rg -i 'agy|antigravity|gemini'`
over `src/`, `test/`, `assets/`, and `README.md` finds nothing.
