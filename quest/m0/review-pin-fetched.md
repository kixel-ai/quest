# [S] Pin the review base its fetch returned

## Goal

`quest review` pins the base commit its own fetch returned instead of
re-reading `refs/remotes/<remote>/<branch>` afterwards, so another writer of
that ref between the fetch and the read cannot change a round's base.

## Plan

Today `fetchBase` in `src/cli/review.ts` fetches into the remote-tracking
ref and returns its name, and the round re-reads the ref with `rev-parse`.
Another writer can move the ref in between, such as another session's fetch
in a shared clone or the kixel daemon that keeps `refs/remotes/origin/<branch>`
at its MoQ track's tip ([branches as tracks](https://github.com/kixel-ai/kixel.ai/blob/main/quest/m2/git/tracks.md),
which waits on this). The round can then pin an older tip than it fetched,
so the review diff includes the base's own newer commits.

Recommended: `fetchBase` returns the fetched commit with its ref, read from
that fetch's own output (`git fetch --porcelain` prints each updated ref's
new object) rather than from `FETCH_HEAD`, which concurrent fetches in the
clone share. The round pins that commit. `fetched: true` callers keep
reading the ref, since nothing fetched for them.

Tests: a writer that moves the tracking ref after the fetch leaves the round
pinned to the fetched commit.
