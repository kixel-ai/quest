# [XS] Quest review posts the RISK.md it classified against

## Goal

Each review run `quest review` posts to Kixel Quest names the base's `RISK.md` blob it was classified against, as the GitHub record's `Risk file` line does, so Kixel Quest stops counting a review once `RISK.md` changes.

## Plan

Decided 2026-11-26 (maintainer, /quest-run, from [kixel-ai/quest#931](https://github.com/kixel-ai/quest/pull/931)'s follow-ups): ✅ keep it, server first (rejected: Kixel Quest's review counting ignores `RISK.md` changes).

The post's shape lives in `quest/core`, and kixel.quest imports it. Following the [epic](/quest/m0/telemetry/README.md)'s order, kixel.quest's side lands the optional field in `quest/core`'s review post parser, sending nothing, and deploys the check. This quest then sends it: the same 12-character blob, or `none`, that `quest review` already writes as `Risk file`.
Tests: a posted run carries the risk file it was classified against.

## Waiting

- kixel-ai/kixel.quest: its `quest/m0/posted-run-risk-file.md` quest accepts and checks `riskFile` on posted runs, and is deployed. Check that the file is gone from that repository's tree.
