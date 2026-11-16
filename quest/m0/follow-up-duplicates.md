# [S] Agents stop adding follow-ups an open PR already owns

## Goal

Before an agent adds a follow-up quest, it finds any quest that already owns the work, on the base branch or in an open PR's quest files, and edits or links that one instead, so a run's merge picks stop asking to drop the same duplicate again.

## Plan

Planned 2026-11-15 with the maintainer in kixel-ai/rind's `/quest-run` of 2026-11-14 and 2026-11-15:

- That run's agents added the rind-fips fork-test hang as a new follow-up five times and the dart-ios hang three times, in separate PRs, each while another open PR or main already had the quest. Each cost a pick round and a manual `quest rm` on the PR.
- `assets/AGENTS.md` says to "search the tree and git history before making a new quest", which covers main but not open PRs. Extend it to open PRs' quest files: read the `quest/**` files each open PR adds or changes. A `gh pr list --search` on the quest's subject is only a supplement, since GitHub's PR search does not read changed files and misses a PR whose text never names the subject.
- Have `quest check`, or the PR flow, warn when a PR adds a quest whose path or title another open PR also adds. A warning, not an error: two PRs may legitimately touch one quest.
- ✅ m0: duplicates cost a pick round each time in every repository using quest (rejected: m1).
