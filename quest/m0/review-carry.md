# [M] Carry findings between review runs

## Goal

Every `quest review` run starts a fresh session, so a later run sees an
earlier run's findings only as `quest review` carries them. Each carried
finding keeps what a fresh reviewer needs to judge it:

- A carried finding names the head its path and line refer to, so a fix
  that moves or deletes the code doesn't show a stale location as current,
  in the report, the prompt, or the PR record.
- A later reviewer can raise the severity of a finding it keeps open, so
  the record and the tallies show the severity the latest reviewer judged,
  not the one it was first reported at.
- The evidence of an accepted refutation reaches later runs, so a fresh
  reviewer that reopens a settled finding answers that evidence. Today the
  author has to repeat it.

## Plan

Found by [kixel-ai/quest#858](https://github.com/kixel-ai/quest/pull/858)'s
review. On 2026-11-24 the maintainer moved these findings to this follow-up,
[on its review's second checkpoint](https://github.com/kixel-ai/quest/pull/858#issuecomment-7145478266).
They concern the finding carry-over that runs without resumed sessions
brought, not seats.

Recommended approach:

- Store each carried finding with the head it was reported at.
- Let a reply's `earlier` entry raise its severity. The raise counts once,
  for the raiser, as tallies count a finding.
- Pass accepted refutations to every later run as settled context, kept
  apart from the findings that need a response, and bounded to the
  branch's own findings.
