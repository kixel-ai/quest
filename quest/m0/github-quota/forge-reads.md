# [L] Forge interface with a Kixel Quest backend for reads

## Goal

quest reads pull request, check, review, claim, hold, and queue state through
one forge interface with two backends: GitHub, which every command uses
today, and Kixel Quest, which answers from its index without spending the
person's GitHub quota. A person with a Kixel Quest token reads a repository
Kixel Quest serves through it; everyone else reads GitHub as before, so
skills and output do not change.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan` in kixel-ai/kixel.quest,
[kixel-ai/kixel.quest#48](https://github.com/kixel-ai/kixel.quest/pull/48)):
✅ a forge interface in quest with GitHub and Kixel Quest backends (rejected:
Kixel Quest emulating the subset of GitHub's REST and GraphQL that quest and
`gh` call, which ties its API to GitHub's shape, `mergeQueueEntry` and
`reviewThreads` included). The same interface later takes the
[writes](/quest/m1/forge-writes.md) for repositories that move off GitHub.
The backend choice and outage behavior are in the
[epic](/quest/m0/github-quota/README.md).

- This quest owns the API's shape. Export the interface's read types and the
  wire format from `quest/core`, which kixel-ai/kixel.quest already pins, so
  its index reads (`quest/m0/read-api.md` there) serve the same types and
  neither side guesses.
- Put `src/github`'s readers behind the interface first, then add the Kixel
  Quest backend. Commands take the interface, not the GitHub client.
- Each answer carries the time of the newest webhook behind it, so
  `quest wait` can tell a quiet PR from a stale index.
- A read Kixel Quest's index cannot answer falls through to GitHub inside
  Kixel Quest, never back in quest.

Tests: the same scenarios run against both backends, a fake GitHub and a
fake Kixel Quest, and give equal answers; a repository Kixel Quest does not
serve reads GitHub; and a Kixel Quest error fails the command naming the
override.
