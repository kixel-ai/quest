# [S] Live reads go through the forge, not a minted token

## Goal

On a repository the configured forge serves, `quest` makes the open-PR list (`quest start`, `release`, `review`), `quest pr view`, and `quest pr list` through that forge's `pulls`, `view`, and `files` reads, and never asks for an installation token. The forge can then deduplicate and rate limit them.
`KixelQuest.installation()` in `src/cli/forge.ts`, the token cache in `src/cli/installation.ts`, and the `liveFor` path that wraps a minted token are deleted.

## Plan

Decided 2026-11-23 (maintainer, `/quest-plan` in kixel-ai/kixel.quest, "proxy these GH events through kixel.quest please so we can deduplicate and rate limit"): ✅ the forge serves these reads and the mint goes away (rejected: waiting for a day of kixel.quest's per-caller counts; keeping the mint). The server side is kixel.quest's [forge dedupe](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/forge-dedupe.md) and [mint removal](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/mint-removal.md).

- The forge already serves `pulls`, `files`, and `view` from GitHub, never from its index. Its answers may now be reused until a webhook touches the pull request or repository, or a short maximum age passes. So "live" here means no older than the last webhook, not read at this instant. Where a command reads right after its own write, as `quest start` does after opening its draft PR, check that it does not depend on seeing that write.
- A repository the forge doesn't serve (a 404) still reads on the person's own token, as today. Writes and the upstream fork probes in `src/cli/claims.ts` stay on the person's token.
- A 429 from the forge fails the command with its `Retry-After`, as a refused mint does today.

Tests: against a local forge, `quest start`, `quest review`, `quest pr view`, and `quest pr list` make no installation-token request and read through `/forge`; a repository the forge doesn't serve still reads GitHub on the person's token; and a 429 fails the command, naming when to retry.
