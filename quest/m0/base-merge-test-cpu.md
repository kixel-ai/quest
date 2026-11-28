# [S] The base-merge property test fits its CPU budget under load

## Goal

`test/base-merge.test.ts` passes `test/budget.ts`'s 10 s per-test CPU budget
however loaded the host is, because its heaviest test spends a small,
deterministic amount of work, not because the budget grew. Every test in the
file keeps its coverage: the property test keeps its 60 seeds and its
clean/conflicted floor, and still checks `BaseMerges` against real git.

## Plan

Found 2026-11-27 while `just test` ran under heavy load on the maintainer's
host during [kixel-ai/quest#978](https://github.com/kixel-ai/quest/pull/978):
the budget check failed once, and the test passed on rerun.

The failing check is not in the test file. It is the global `afterEach` in
`test/budget.ts`, added in
[kixel-ai/quest#631](https://github.com/kixel-ai/quest/pull/631), which sums
the worker's and its reaped children's CPU from `/proc/self/stat`. The budget
assumes 5x headroom over the heaviest test, then 1.9 s. CPU time for the same
work still rises with contention (SMT siblings, lower clocks, cold caches), so
that headroom is what keeps the budget load-independent.
[kixel-ai/quest#958](https://github.com/kixel-ai/quest/pull/958) added the
property test "judges a merge clean exactly when git merges its parents,
without renames, into its tree". Measured 2026-11-27 (32 cores, Vitest 5.1,
git 2.56), it spends 8.4 to 8.8 s of CPU at load ~40, and 5.6 s once load
fell: 4,879 `git` spawns at about 1.7 ms each. Every other test in the file
spends under 0.3 s. Name #958 under `## Caused by`: its test used up the
budget's headroom.

Decided (agent, per the repository's rules): fix the test's cost.
Rejected: raising the budget or adding a retry, since both hide the next test
that eats the headroom. Rejected: fewer seeds, which weakens the differential
check of the gate that decides whether a review carries. Rejected: moving the
test to an async run, since it is the core's second, independent
verification and can be made cheap. It is not a performance guard, so it
needs no performance assertion of its own.

Target: the property test spends at most 2 s of CPU idle (a fifth of the
budget, as `test/budget.ts` assumes). The load-independent proxy is its
`git` spawn count, currently 4,879, so aim for roughly 1,000 or fewer.
Spawns by subcommand: rev-parse 900, rev-list 720, hash-object 716, ls-tree
661, merge-base 540, commit-tree 360, mktree 356, config 301, cat-file 144,
and 60 each of init, branch, and merge-tree.

Levers, largest first (recommendations, not requirements):

- Serve `gitHistory`'s object reads (`commit`, `tree`, `blob`) from one
  long-lived `git cat-file --batch` per repository instead of a spawn per
  read. That covers about 2,200 of the spawns and speeds up every test that
  uses `gitHistory`. The core only compares object ids, so the helper can
  parse commit and tree objects itself. Close the process when the test
  ends.
- Write each seed's three commits with one `git fast-import` (or batched
  `hash-object --stdin-paths` and `mktree --batch`) instead of about 20
  spawns.
- Use one repository for all seeds. Objects are content-addressed, and
  `main` is already reset per seed. That skips 60 `init` calls, 300 `config`
  calls, and the merge-driver setup, which this test never uses.

Count spawns with a `git` wrapper on `PATH` that logs `$3` (the subcommand
after `-C <dir>`). Measure CPU with a scratch Vitest setup file that logs
`spent()` from `test/budget.ts` per test. Record both, before and after, in
the PR's `## Validation`. Update the "1.9 s, 2026-11-11" figure in
`test/budget.ts` if the heaviest test changes.

Reproduction, tried 2026-11-27: a gated `stress-ng --cpu 32` ran while the
test was queued under `quest gate`. The gate held the test until the hog
finished, so the two never overlapped, and the test passed at 5.6 s. The
original failure ran inside one gated `just test`, whose parallel Vitest
forks and the host's ungated agent work load the CPU together. The
5.6-to-8.8 s spread for identical work is the evidence of load dependence.

## Hosts

- linux - only Linux exposes children's CPU, so the budget applies only there
