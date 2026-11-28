# [XS] Export history from quest/github

## Goal

`quest/github` exports `history`, the GitHub REST adapter in `src/github/history.ts` that `BaseMerges` reads a PR's history through, so a consumer judging base merges against GitHub reads that history the way `quest status` and the land gate do instead of copying the adapter.

Non-goals: any change to `history`'s behavior or signature, or to `quest/core`'s `BaseMerges`, `History`, and `TreeEntry`, which it has exported since [kixel-ai/quest#958](https://github.com/kixel-ai/quest/pull/958).

## Plan

Approved 2026-11-28 (maintainer, `/quest-run`).
Kixel Quest's planned review-base-merges quest needs it: without the export it would copy about 60 lines that could drift from the land gate's reads.

Recommendations:

- Export `history` from `src/github/index.ts` beside `GitHubForge`. Its existing one-line doc comment already says what it returns; keep it to one line.
- Name it in `index.ts`'s header comment, which lists what the module exports, and in the README's sentence on `quest/github`'s exports (beside `GitHubForge`).
- The PR's public API section: `quest/github` gains `history`, additive, with no wire change, so no `!`.

Tests: none new. `just check` runs `tsc -p src/github`, which covers the export compiling for a Worker host.

## Related

- [Kixel Quest's review-base-merges quest](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/review-base-merges.md) - its consumer, planned in [kixel-ai/kixel.quest#261](https://github.com/kixel-ai/kixel.quest/pull/261); its `Waiting` item on this export clears once it lands
