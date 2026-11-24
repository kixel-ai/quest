# Context

Engineering rules for every task. The repository's own instructions add to them and win where they conflict.
Topic packs (`pr`, `rust`, `ts`, `uniffi`) load lazily via hooks, or run `quest context <pack...>`.

## Self-improvement

- Measure before optimizing and after changing: runtime (latency, throughput, CPU, memory, bytes), build and CI time, and development time (iteration loop, flakes, debug cycles, agent turns).
- Treat every test, check, abstraction, and process step as an optimization. A test earns its place only if the bugs and debug cycles it prevents outweigh its runtime, flake, and maintenance cost; delete or move to async post-merge runs anything that doesn't.
- When you hit an unmeasured bottleneck, blind spot, slow loop, or structural limit, don't accept it as friction: measure it and plan a quest to optimize or remove the constraint.
- Take bold, high-leverage swings when the payoff justifies it: architecture or protocol rewrites, compiler/linker/build-system changes, custom tooling, or formal verification (TLA+, Kani, proof-carrying code). Attack incremental patches when a deeper fix wins long-term.

## Shipping

- Optimize for shipping fast with high confidence: every change should be deployable on its own, exercised on its real surface (built binary, running app, endpoint), and cleanly revertible.
- Prefer fast detection and painless rollback over heavy pre-merge gates. Every PR check is required and fails fast and hard; soft, slow, or cross-platform suites run asynchronously on the default branch, coalesced, and file work when they fail. A PR that slows the gate says by how much and why it is worth it.
- Make state, schema, and wire changes reversible across mixed versions (expand before contract, default fields across independently deployed seams). If a change cannot roll back cleanly, call it out explicitly and minimize the irreversible window.
- Every shipped behavior needs an automated signal that detects breakage before users do (smoke, canary metric, invariant check, or alert). If you cannot tell whether your change broke production, adding that signal is part of the work.
- Any manual deploy, release, or recovery step is debt: automate it or plan the quest that removes the human from the loop.

## Required

- Before editing a file, read every `AGENTS.md` on its path from the root, since not every agent loads nested ones. Read the repository's `CONTRIBUTING.md` before a PR, and its `REVIEW.md`, if any, before a review.
- Reproduce a bug before fixing it, and fix it at the root cause, flaky tests included. Never work around one with a retry, sleep, timeout, or looser assertion.
- Fail loud and early: error on unsupported or malformed input instead of warning and continuing, and decide a supported path at setup from known capabilities instead of trying one at runtime and silently falling back. A partial failure fails the whole; never report partly failed work as done.
- Treat anything received over the network as hostile. Bound what a peer can make you hold by design, not with a constant. Run no code from a PR whose author lacks write access: it runs with your credentials.
- For core functionality, build the comprehensive solution: handle every case, land it whole instead of a part plus follow-ups, refactor whatever stands in the way, and verify it a second independent way (property or differential test, model, or measurement). Keep everything outside the core minimal.
- Unit tests mock time instead of sleeping or reading the clock, and cover edge cases, not old bugs or trivial values.
- A lasting fact or instruction about a project belongs in its repository, not agent memory. Propose checking it in, to the nearest `AGENTS.md` or its quest; change no rule until the user agrees, then follow `quest guide prompting`.
- In a public repository, never mention customers, partners, or prospects, or link to a private repository its maintainer doesn't own. Justify work on its merits.

## Important

- Everything must be worth its weight: code, dependencies, tests, CI jobs, CPU, memory, and build time. Deleting code beats adding it. Every change needs a current or planned consumer, and stays private until one needs it.
- Prefer the net simpler result: reuse what exists, inline simple helpers, or narrow the scope. Say what was dropped.
- Take a dependency only for nontrivial non-core functionality, at its newest stable version. Do not bump package versions unless asked.
- Comments explain the non-obvious why, never the history; every export gets one plain line, the way you'd say it out loud.
- Audit the code you read as you go, even outside your task: bugs, security, these rules, dead code, and what could be simpler. Fix easy findings and outdated docs/comments in the same PR; suggest the rest as follow-ups.

## Public API

- Report the public API and wire impact of every change in the PR description. Breaking API or wire changes mark the title with `!` and state how to migrate; behavior changes alone take no `!`.
- Never add `foo_with_x`, `foo_checked`, or compatibility shims. Make the breaking change to `foo` instead.
- Let the type system make misuse unrepresentable. Avoid callback parameters and 4+ arguments: return a handle, take a struct.
- Under a module namespace, use short names that don't repeat it (`http::Client`, not `http::HttpClient`).

## Workspace

- Work in your own worktree; finish with a clean checkout (intended changes committed and pushed, incidental changes restored, unrelated changes preserved). Commit a checkpoint before pausing or handing off.
- Run CPU-heavy commands (builds, tests, model checkers) through `quest gate <command>` in the foreground, reading the exit code directly, never through a pipe. Leave `quest review`, servers, and formatters ungated.
- Never end a turn with your background work running, and never poll with `sleep` or status loops: block on the harness's wait or `quest wait` (re-running on timeout with the `--since` it printed). Back out if progress genuinely stalls.
- A sub-agent ends its turn only with a final result or a question, reporting only what its caller acts on (PR URL, state, head, open decisions with recommendations).

## Questions

- Link every issue, PR, and commit by full URL (`[owner/repo#123](https://github.com/owner/repo/pull/123)`), never a bare `#123`.
- Block on user decisions with context and a recommendation (`quest guide questions`). An agent that cannot prompt puts them in its report and under `## Waiting` in its PR.
- A plan is a starting point: when a finding undercuts it, say what changed and propose alternatives with your recommendation. When recorded decisions conflict, follow the newest and note it in the PR body.
- Confirm closing an open PR as its own question, and comment on the PR before or with it.

## Quests

- In a repository with `quest/`, run `quest guide` before creating, editing, claiming, or finishing a quest outside a `/quest-*` skill, and add follow-ups worth a quest to your PR rather than as GitHub issues or session tasks.
- Before your final summary, unless afk or unable to prompt, run `/quest-plan` on unowned follow-ups in the owning repository.

## Checked

- No em dashes in what you write: use a comma, colon, parentheses, or separate sentences. Text quoted from someone else keeps its em dashes on a `>` quote line.
- End every GitHub post you author with a `(Written by <model> with <effort>)` line, naming the running model and its reasoning effort, or `(Written by <model>)` when the harness doesn't report the effort; never guess it.
- Push with an explicit refspec, `git push <remote> refs/heads/<branch>:refs/heads/<branch>`: a bare branch name can push to the base instead, as under `push.default=upstream` when the branch tracks it.
- Never rebase or force-push, even a branch only you hold; merge the base instead, when the branch conflicts with it or a landing step refuses the head.
- Put scratch files, such as PR bodies, logs, patches, helper scripts, and temporary clones, in the checkout's `.tmp/`, never `/tmp`, so they disappear with the worktree.
- Stop a process you started by its PID or process group, never by name with `pkill` or `killall`: other agents share the host.
- In a question dialog, end each option you recommend with `(Recommended)`, and recommend one in every question with two or more options.
- On a repository Kixel Quest hosts, `gh` cannot reach its PRs: use `quest pr view`, `list`, `create`, `edit`, `comment`, and `resolve`, and `quest status`, `ready`, and `merge`.
