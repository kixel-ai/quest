# Cost audit

The goal is CI, tests, builds, and shipped artifacts that each earn what they cost, with growth since the last run explained, fixed, or planned.
The scope is every CI workflow and job, the merge gate and its suites, build time, and the size of every artifact the repository ships.
Dependencies belong to the `deps` audit, and what tests cover to the `tests` audit.

Look for:

- CI: table every workflow and job by signal (what it catches that nothing cheaper does), visibility (a gate, an alert, or a report someone reads; a result only in a log or artifact is invisible), and cost in runner minutes by runner type. Sum minutes from each job's own timing, never from billing totals. Count failures by cause: many jobs failing on one build error is one finding, and a green build is not a caught regression.
- The gate: its slowest, flakiest, and least valuable steps, compile time included, changes that run steps they cannot affect, and any PR check that is optional or not a hard failure. Classify a failure before calling it a flake, and fix a flake at its cause rather than deleting its test.
- Tests: each test's time from one invocation, recording the test count, profile, and threads.
- Build time: the crates, packages, or modules that cost the most, cold and after a typical edit. Repeat an edit before timing it, since the first only records incremental state.
- Artifact size: growth in every shipped binary, library, bundle, image, and closure since the last run, attributed by package or symbol namespace.

Compare like with like: recorded commits, the same target, profile, and cache state, and the host's load noted; never an archive against a binary, or a stripped build against one with symbols.
Prefer measurements the repository already records, such as benchmark history or gate timings, to manufacturing repeats on a busy host.

Delete by default what doesn't earn its cost; otherwise make it cheaper or move it off the gate to a coalesced run on the default branch.
List each deletion in the PR body with its measured cost and why it was not worth it.
Removing a public API, a user-facing feature, or a release target, and trading runtime cost for build time, are the maintainer's decisions.
Record the run's measurements with their commits and hosts as the next stub's baseline, and the approaches it tried and rejected, so the next run doesn't repeat them.
