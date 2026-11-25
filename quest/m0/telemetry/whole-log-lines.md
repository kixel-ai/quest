# [S] A short write never leaves a torn log line

## Goal

A short write while `quest` appends to its `calls` or `waits` day logs, such as on a full disk, never leaves a partial line that blocks later reads. A host whose log already holds a torn line recovers on its own: the record sender keeps sending.

## Plan

Found 2026-11-24 in [kixel-ai/dotfiles#262](https://github.com/kixel-ai/dotfiles/pull/262)'s review. Kept by the maintainer at its merge pick.

`appendLog` (`src/cli/waits.ts`) writes each record with one `O_APPEND` write and throws when it writes fewer bytes, but the bytes it did write stay. `readDays` then rejects that line on every pass, so every queued session on the host stops sending until someone edits the log by hand.

Decided 2026-11-24 (maintainer, `/quest-plan` from dotfiles, "I really don't care", so the agent's choice): ✅ after a short write the writer appends a newline to end its own fragment, so the next record starts on a fresh line, and the reader skips any line that doesn't parse, logging each one it skips (rejected: truncating back to the writer's start offset, which can delete another writer's line appended in between; one file per record renamed into a per-day directory, which changes the layout and needs a migration).

Tests: a short write followed by a whole one leaves the second record readable; a file holding a torn line, last or between whole ones, reads every whole line and logs the torn one.
