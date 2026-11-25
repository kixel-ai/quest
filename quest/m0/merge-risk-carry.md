# [S] A review carries across a base merge only under the same RISK.md

## Goal

`/quest-merge` counts a review across a conflict-free merge from the base
only while the base's `RISK.md` is the file the review was classified
against. Once it changed, the head waits for a new `quest review`, which
classifies it under the current rules.

## Plan

`quest status` reads a review record as `stale` once `RISK.md` at the
base's tip is not the file the record names, and warns `run quest review
again`. `assets/skills/merge.md` still lets an agent count a stale record
when the only changes since the reviewed head are conflict-free merges
from the base. Suppose a low PR passed with no local reviewer, and the base
then narrowed its class or made it medium. After a conflict-free base merge,
the agent could carry the old pass forward and queue the PR without the
review it now needs. A head the base now holds high is refused at
`quest merge --land` once https://github.com/kixel-ai/quest/pull/889
lands. This quest covers the medium and unclassed cases that the other one leaves.

Recommended: in merge.md's carry-forward exception, exclude a record that
`quest status` warns was classified against another risk file. Alternative:
have `quest status` print a distinct `review-record` reason, such as
`stale risk-file`, so that a skill reads the field instead of the warning.
That changes the plain output, so it is high.

## Related

- [A high head lands only with a review status for its diff](/quest/m0/high-review-status.md) - enforces the high case at landing
