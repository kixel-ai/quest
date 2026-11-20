# [XS] Export ago from quest/github

## Goal

`quest/github` exports `ago`, the "3 hours ago" formatter in `src/github/hold.ts`, so kixel-ai/kixel.quest's `src/reads.ts` drops its copy at its next `quest` pin bump.

## Plan

Found 2026-11-19 in [kixel-ai/kixel.quest#76](https://github.com/kixel-ai/kixel.quest/pull/76), which copied `ago` because the package entry (`src/github/index.ts`) does not re-export it.
✅ m0, beside the forge work kixel.quest consumes (rejected: m2; dropping it and keeping the copy). Decided 2026-11-19 (maintainer, `/quest-plan` from kixel.quest's `/quest-complete`).
