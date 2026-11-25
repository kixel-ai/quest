# [S] Queued reviewer sessions carry their PR and role

## Goal

A session `quest review` queues reaches Kixel Quest on the PR it reviewed and as the role it played (classifier or reviewer), even when its checkout is off the PR's branch or the PR's `## Review` record does not name it, so its spend is never attributed to nowhere or counted as the PR's ordinary work.

## Plan

Found in review of kixel-ai/quest#893, which queues reviewer sessions the way the stop hook queues an interactive one. Two gaps remain, both because the sender infers them:

- The sender attributes a session to the PR whose head branch its transcript's checkout names, so a reviewer run from the runner's review checkout (`kix-review/<job>`) or a detached checkout with `--branch` lands on no PR.
- The sender reads a session's role from the PR body's `## Review` record, so a classifier that spent tokens on an unusable reply, or one of a round that failed before its record was written, is counted as ordinary work.

Recommended: each queued session carries the branch `quest review` resolved and its role, and the sender prefers both over its inference. The stop hook's own sessions stay as they are.

Tests: a reviewer session queued from a detached checkout with `--branch` is attributed to that branch's PR; a classifier absent from the PR body is labeled a classifier.
