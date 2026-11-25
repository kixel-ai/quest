# [S] Sessions count under a transferred repository's current name

## Goal

`quest usage` and the record sender count a session whose recorded repository is a transferred or renamed repository's former name, such as `moq-dev/quest` for `kixel-ai/quest`, toward the repository it is now, so a transfer doesn't strip a repository's PRs of the sessions that worked on them before it.

## Plan

Found 2026-11-25 in the [benchmark epic](/quest/m0/benchmark/README.md)'s end-to-end check. `kixel-ai/quest` was `moq-dev/quest` until 2026-11-23, and Codex logs and checkouts read before then name the old repository. `owners()` in `src/cli/usage.ts` takes those names as they are, and `headed()` then matches no PR, so:

- `quest usage --pr 819` lists no session at all, though token-max exports 32 sessions (about $148) on its branch on the host that wrote it, and Kixel Quest prices it at $10.58. The Claude sessions there resolve no repository, since their worktree is deleted, and borrow `moq-dev/quest` from the Codex sessions in the same directory.
- `quest usage --pr 832` lists its implementing session but none of its four Codex review sessions ($1.08), which recorded `moq-dev/quest`.
- The sender logged `sent 1 records ... of moq-dev/quest`, a repository Kixel Quest no longer serves under that name.

kixel-ai/rust2 moved from moq-dev the same way, so this recurs with each transfer.

- Recommended: map each distinct repository name the sessions name to its current one through GitHub's repository API, which answers a former name with the current repository, once per name per run, before `owners()` and `headed()` compare them (rejected: a hand-kept alias list, which misses the next transfer; dropping the recorded name, which loses the only repository a deleted checkout's sessions have).
- A name GitHub no longer serves at all (deleted, or never public to the token) stays as recorded.
- The sender builds records the way `quest usage` does, so the one mapping covers both.

Tests: a session recording a former name counts toward the PR its branch heads in the current repository; a Claude session with no repository, in a directory where a Codex session recorded a former name, counts the same; each distinct name is looked up once.

## Related

- [Deleted checkouts](/quest/m0/telemetry/usage-deleted-checkouts.md) - the other way a session loses its repository
