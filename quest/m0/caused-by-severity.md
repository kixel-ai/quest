# [S] Caused by lines carry a severity

## Goal

Every `## Caused by` line says how far the regression reached, as `severity low`, `severity medium`, or `severity high` in its parenthesis, such as `(found by check; severity medium; incident 123)`. `quest usage` reads it and reports each breakage's severity beside the culprit's risk tier, so a readout can compare the tier predicted at review with the blast radius that resulted.

Non-goal: the merge queue's refusal of a line without one, which Kixel Quest owns.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups), which authorizes the edit to `assets/context/pr.md`:

- Plan it? ✅ In the `## Caused by` format (rejected: dropping it, since the second-seat ablation decides on escape counts; a tally in Kixel Quest's weekly mistake audit only).
- Scale? ✅ `low`, `medium`, `high` by who the regression reached, mirroring `RISK.md`'s blast-radius tiers (rejected: minor/major/outage, which don't map to the tiers). Draft wording for the implementer to tighten: high reached users, production, a release, or data; medium reached other agents or developers, such as a broken main, CI, skill, or host; low reached only later work in its own repository.
- Required? ✅ Required by the guide, and Kixel Quest's queue refuses a line without one, as it plans for a missing finder (rejected: optional, which left 74% of finders blank in the audit).

Agent's choices:

- Extend `culprits()` in `src/cli/breakage.ts`, which [sessions](/quest/m0/telemetry/sessions.md) also changes to keep a reviewer's name; whichever lands second rebases onto the other's regex.
- Kixel Quest's refusal waits on this wording, as its finder refusal waits on sessions' wording; the PR adds that as a follow-up for kixel-ai/kixel.quest.

Tests: `culprits()` reads a severity with and without a finder and an incident around it, and a line without one still parses, with severity null.
