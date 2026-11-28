---
description: Ask a stronger model for a fresh approach when you are stuck on a branch, such as review rounds that keep finding issues or an implementation that does not converge; not for routine work or a broken environment.
guide: Questions
---

Run `quest advise "<what you tried and where you are stuck>"` from the branch's checkout, passing `--base` and `--branch` as you would to `quest review`.
Say concretely what you tried, what failed, and which findings or errors keep coming back; the advisor already reads the change, its quest, the PR body, and the saved review rounds.
Use it when you are stuck, not for routine work or for an environment failure, such as a missing tool or a network error, which advice cannot fix.
It answers once per branch's PR; pass `--force` only when the user asks.
When it refuses because the branch was already advised, or exits 3 because no advisor could run, report that, and at a review's `next decide` stop hand the PR back to the user with the earlier advice, if any.

Invoked on its own, report the advice, a line per approach with your take, and stop: make no edit and write nothing to GitHub.

When the request you work on states an explicit limit, such as "fix the packaging only", pass it with `--limit`.

Inside a task that already lets you edit and push the PR, such as `/quest-start`, `/quest-iterate`, or `/quest-run`, follow its last line, which stands in for the user's pick:

- `next apply`: take the recommended approach's steps, even past the quest's settled scope or architecture. Check each against the code and decline one you refute in a line; hand back as `next decide` does any step past the request you work on, whatever the advisor's verdict. Post a PR comment that starts with `Design change:` saying what the advice changed and why, update the quest and PR body to match, and review the result with `quest review --new`.
- `next decide`: change nothing, and ask the user to pick among the advisor's approaches, with its recommendation; an agent that cannot prompt puts that decision under the PR's `## Waiting`.
