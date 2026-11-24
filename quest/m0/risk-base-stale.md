# [M] Risk records go stale when the base's risk file changes

## Goal

`quest status` reports a PR's risk tier and class as stale when the base's
`RISK.md` has changed since the review that classified the head. A standing
`/quest-run` pick, which needs the head to be low and in a class, then
waits for a new review instead of landing under rules the base no longer
holds.

## Plan

Today the tier and class count as current while the head is unchanged
(`risk` in `src/github/status.ts`). The base can still narrow a class's
scope, drop a class, or add a `## High` path the head touches, and the
record would still read as current. A classed low PR would then land on
the standing pick even though the current base would not offer it that
class.

Recommended: have the record name the risk file it was classified
against, such as the base's `RISK.md` blob SHA, which `classify` already
reads. `quest status` then compares it with `RISK.md` at the base's tip and
reports a mismatch as a stale tier. A record without that line is stale
too, since nothing is in production. Avoid rereading the PR's changed
files in `quest status`: the review that reruns reclassifies under the
new file, and `classesFor` stays the only place scopes are checked.

The record format and `quest status` output are read by Kixel Quest and
skills, so the PR is high under `RISK.md`. Its tests include a record
classified against an older `RISK.md` that reads as stale, and one
classified against the current file that reads as current.
