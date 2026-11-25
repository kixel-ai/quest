# [S] Reviewer sessions name the PR they reviewed

## Goal

A session `quest review` queues reaches Kixel Quest on the PR it reviewed, even when its checkout is off the PR's branch, as the runner's review checkout (`kix-review/<job>`) and a detached checkout with `--branch` are, so the reviewer's spend is attributed to that PR instead of nowhere.

## Plan

Found in review of the PR that queues reviewer sessions (kixel-ai/quest#893): the sender attributes a session to the PR whose head branch its transcript's checkout names, and a reviewer's transcript names the checkout's branch, not the one `quest review` resolved.

- Recommended: `quest review` stores the branch it resolved (`--branch`, else the checkout's) in each queued session, and the sender tries it before the transcript's branches.
- The stop hook's own sessions stay as they are.

Tests: a reviewer session queued from a detached checkout with `--branch` is attributed to that branch's PR.
