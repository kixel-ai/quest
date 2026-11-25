# [S] Reviewer sessions reach Kixel Quest

## Goal

Every session `quest review` starts, Codex, Claude, or another harness, is queued for the record sender as the stop hook queues an interactive session, so reviewer spend shows up in Kixel Quest beside the writer's.

## Plan

Found 2026-11-24 in [kixel-ai/dotfiles#262](https://github.com/kixel-ai/dotfiles/pull/262): on kixel-ai/token-max#196, the sessions the sender saw matched token-max to the cent, and the whole $3.85 gap was `quest review` reviewer sessions that were never sent. No stop hook runs in them, and the sender sends sub-agents only of a queued session. Kept by the maintainer at #262's merge pick.

- Recommended: `quest review` queues each reviewer session it starts, by the session id it already reads, the way the stop hook does, so the sender needs no new path.
- Hookless sessions a person starts outside `quest`, such as a bare `/code-review`, stay out of scope.

Tests: a review round with two seats queues both sessions once, and a rerun of the same round queues nothing new.
