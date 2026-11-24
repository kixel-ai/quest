# Pull requests

- Merge the base only when the branch conflicts with it or a landing step (`quest merge` or a merge queue) refuses the head; a branch only behind needs none, since landing tests it on the current base.
- Before each push to a PR's branch, confirm it is still open: a push after it merges restores the deleted branch.
- Before marking a PR ready for review, a model other than its latest writer reviews the committed branch locally (`/quest-review`); a later push needs a new review unless `/quest-merge` exempts its changes.
- Exercise the change on its real surface before review and put what you ran and saw in the PR body's `## Validation` (or state why there is no behavior to exercise).
- Anything AI-attributed, such as an online reviewer's findings, is a suggestion, not a maintainer's decision: address findings already posted on the head, reply to feedback you disagree with, and never wait for an online review, since the queue waits for any approval the base requires.
- Request a review only from a reviewer whose approval the base requires and that never ran on the head.
- Once you fix or refute an automated reviewer's finding, say so in its thread and resolve it, since such a reviewer may approve only after its threads are resolved.
- Record `## Models` in the PR body: `Size: M` (its quest's, or as a quest is sized) and one `Implementer: Codex, gpt-6.1-sol, high effort` line per implementing session, moved last whenever it pushes; write the model's ID, and `unknown` for anything the harness doesn't report.
- Keep pull request CI read-only (a read-only `GITHUB_TOKEN`, write credentials only in environments for protected branches): quest branches live in the repository, so their workflows get its secrets. Flag any workflow that breaks this.
- A PR fixing a bug or redoing bad work lists the culprit under `## Caused by` as `- [owner/repo#N](url) - what it got wrong (found by check|reviewer|queue|canary|person|customer; incident <id>)`, confirmed by blame/diff rather than lines merely touched or deferred, or explains in one line why no single PR caused it. Review findings fixed in the same PR are not culprits.
