# [S] quest start never moves a checkout off its default branch

## Goal

Run from a checkout on the repository's default branch, such as the main
clone, `quest start` leaves that checkout's branch alone: it creates, or
reuses, a worktree under `.worktrees/` on the claim's branch and prints its
path. From any other checkout, such as a worktree an agent already owns, it
keeps today's behavior and switches that checkout to the claim.

## Plan

Decided 2026-11-22 (user, /quest-plan of the follow-up from
[kixel-ai/dotfiles#237](https://github.com/kixel-ai/dotfiles/pull/237)):
✅ create or reuse a worktree when run from the default branch (rejected:
refuse there and make every agent retry from a worktree; rejected: never
switch any checkout, leaving every agent to check the branch out itself).

- Found in #237: `quest start` in the main clone switched it to the quest
  branch. The maintainer's host updates that clone hourly and refuses one off
  `main`, so the update would have stopped until someone switched it back.
- `checkout()` in `src/cli/start.ts` runs `git switch -c` in whatever checkout
  `--root` names, and `test/start.test.ts` asserts the main clone's HEAD
  moves. That test changes with this quest.
- Recommended: reuse `quest worktree`'s ownership and `.worktrees/` layout
  rather than a bare `git worktree add`, so `quest worktree` can release it.
  A worktree that already has the branch checked out is reused, not
  duplicated.
- The user's pick authorizes the edit to `assets/skills/start.md` that tells
  the agent to work in the printed path.
- Caused by [moq-dev/quest#167](https://github.com/moq-dev/quest/pull/167),
  which added `quest start` switching the checkout it runs in, whichever
  branch that checkout was on.
