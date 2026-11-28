# [M] Iterate routing reads writers from Kixel Quest, replacing Implementer lines

## Goal

The skills stop writing `Implementer:` lines, and whatever read them (iterating on the writer's model, keeping a reviewer no weaker than the writer's model, an armed PR's iterates keeping their cohort and advisor after a resize) reads the writer from Kixel Quest's `writers` read instead, typed as `Writer` in `src/core/forge.ts`.
`## Models` keeps its `Size:` line, which starting and reviewing need.

## Plan

Decided in the [epic](/quest/m0/telemetry/README.md): ✅ `Implementer:` lines become posts. Split out of [sessions](/quest/m0/telemetry/sessions.md) on 2026-11-27 (agent's choice), so records carry the routing decision, an arm's cohort and advisor included, before anything stops writing the line that holds them today.

- An iterate routes to the model with the largest share of the PR's writing cost, skipping a null model, as kixel-ai/kixel.quest's writer read (`quest/m0/insight/writer-read.md` there) plans; an armed writer's iterates run its recorded cohort and advisor.
- A writer often pushes and runs `/quest-review` in the same turn, before its Stop hook queues the session's record, so the `writers` read cannot know that writer yet: review also reads the running session's own writer from its local record and counts the stronger of the two, and the skills keep writing `Implementer:` lines until a test covers that same-turn path.
- Update the guide (`assets/AGENTS.md`'s iterate routing), `assets/CONTEXT.md`'s `## Models` rule, and the run, iterate, and review skills; the epic's decision is the maintainer's request for that work.

Tests: an iterate routes to the writer Kixel Quest reports; a review run in the turn that pushed the head, before the session's record is sent, avoids models weaker than that session's and keeps its model eligible; an armed PR's iterate after a resize keeps its cohort and advisor; no skill writes an `Implementer:` line.

## Waiting

- kixel-ai/kixel.quest: its `writers` read answers each writer's cohort and advisor beside its arm, from the routing records [sessions](/quest/m0/telemetry/sessions.md) sends, with the fields landed in `quest/core` first. Check that the `Writer` shape in `src/core/forge.ts` here has both and Kixel Quest fills them.

## Required

- [Sessions](/quest/m0/telemetry/sessions.md) - records that carry the routing decision, cohort and advisor included
