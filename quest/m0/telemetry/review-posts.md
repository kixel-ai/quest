# [M] Quest review posts its rounds instead of writing the Review section

## Goal

`quest review` posts each round to Kixel Quest: head, base, seat (harness, model, effort, rung and how it was drawn), session, the risk tier with its reason and classifier, and each finding with file, lines, and severity, plus each finding's outcome as `--responses` settles it.
A head that gets no local reviewer posts its classification alone.
A post gates a merge only when its poster has write access, so a contributor's own rounds are recorded but a maintainer's review still decides.
It no longer writes the PR body's `## Review` section, and `quest status`, `quest merge`, and readiness read the review from Kixel Quest.

## Plan

Decided in the [epic](/quest/m0/telemetry/README.md): ✅ `## Review` moves out of the body.

- The saved rounds under `.git/quest/review/` already hold what a post needs; post them as they are written.
- Update the guide, `assets/CONTEXT.md`, and the review, iterate, and merge skills where they describe the `## Review` record; this decision is the maintainer's request for that work.

Tests: a round posts each finding with its location; a `--responses` round posts each finding's outcome; a low head posts its classification alone; and the PR body is left unchanged.

## Waiting

- kixel-ai/kixel.quest: its [review posts](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/insight/review-posts.md) server side is deployed and reads posted rounds. Check that it accepts a round from a local `quest review`.

## Required

- [Login](/quest/m0/telemetry/login.md) - the token each post carries
