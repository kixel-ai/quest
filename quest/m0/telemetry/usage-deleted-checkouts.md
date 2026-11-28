# [S] Quest usage counts sessions whose checkout is gone

## Goal

`quest usage` counts a session after its checkout is deleted, taking the session's repository from its record rather than re-resolving the deleted path, so a repository's totals don't drop as worktrees are cleaned up.

## Plan

Found 2026-11-24 in [kixel-ai/dotfiles#262](https://github.com/kixel-ai/dotfiles/pull/262): kixel-ai/quest#831's session, costed at $10.411062 by both Kixel Quest and token-max, was missing from `quest usage` because its worktree had been deleted. Kept by the maintainer at #262's merge pick. It matters more since kixel-ai/dotfiles#273 deletes worktrees idle a day on every host.

Measured 2026-11-28 by the agent audit in [routing evidence](/quest/m0/routing-evidence/README.md): of about $67k of spend since 2026-11-01 on fedora, nixos, desktop, and mini, `quest usage` traced about $12.6k (19%) to a PR across eight repositories. On fedora, sessions with no resolved repository held 86% of Claude spend, every one with a deleted checkout and a recorded branch. 43% of merged non-bot PRs had any session cost attributed.

- Decided 2026-11-28 (maintainer, `/quest-plan`): ✅ wait for sessions (rejected: a stopgap matching a session with no repository by its recorded branch against the reported PRs' head branches, deleted once sessions lands).
- Recommended: once [sessions](/quest/m0/telemetry/sessions.md) makes each record name its PR from the first request, read the repository from the record (or from Kixel Quest's store), and keep the path lookup only for a record without it.

Tests: a session whose checkout no longer exists counts toward the repository its record names.

## Required

- [Sessions](/quest/m0/telemetry/sessions.md) - records that name their PR
