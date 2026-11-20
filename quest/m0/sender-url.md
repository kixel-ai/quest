# [S] Session records go to the Kixel Quest they were queued for

## Goal

A session record the stop hook queues for a Kixel Quest reaches that Kixel Quest, whatever environment the installed `quest records sender` runs in.
The sender discards queued records only when the person removed that Kixel Quest's token or it refused the token, never because its own environment names another Kixel Quest.

Non-goal: changing how tokens pair with Kixel Quest URLs (`src/cli/tokens.ts`).

## Plan

Found 2026-11-19 by CodeRabbit on [kixel-ai/kixel.quest#75](https://github.com/kixel-ai/kixel.quest/pull/75): the stop hook runs in the person's shell and queues a record only after finding a token for the URL `QUEST_KIXEL_URL` names (`src/cli/send.ts`).
The service `quest records install` writes copies only `KEPT` (`src/cli/service.ts`), which lacks that variable, so the sender targets `https://kixel.quest`, finds no token for it, and settles the whole queue in `sendOnce`, the path meant for a removed token.
Caused by [moq-dev/quest#767](https://github.com/moq-dev/quest/pull/767), which made the sender resolve the URL from its own environment.

Decided 2026-11-19 (maintainer, `/quest-plan` from kixel.quest's `/quest-complete`):

- ✅ Fix the dropping, not only the variable (rejected: adding `QUEST_KIXEL_URL` to `KEPT` alone, which still drops records whenever the variable changes after install).
- ✅ Each queued record carries the URL the hook checked; the sender sends each record to its own URL with that URL's token, and settles a record only when that token is gone or refused (rejected: `KEPT` plus keeping the queue when no token is found, which leaves no way for removing a token to stop sending, so the queue grows forever). The service then needs no `QUEST_KIXEL_URL`, and records for two Kixel Quests can share one queue.
- ✅ m0: it silently loses records on the adoption path (rejected: m1).

Per `AGENTS.md`, queue files earlier versions wrote get no migration.

Tests: a record queued under one `QUEST_KIXEL_URL` is sent there by a sender whose environment names another or none; a record whose URL's token was removed or refused is settled while one for another URL is sent; and the service definition carries no `QUEST_KIXEL_URL`.
