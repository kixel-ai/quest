# [XS] Pullfrog reviews have what their checks need

## Goal

Before the agent starts, Pullfrog's review run has what the repository's
checks and tests need, such as Nix, the dev shell, `quest`, and `just`, in
each repository whose Pullfrog reviews would run them. The bot then runs the
repository's checks and tests instead of reasoning around their absence.

## Plan

Done: rind needs no setup. With its test vectors vendored
([kixel-ai/rind#714](https://github.com/kixel-ai/rind/pull/714)), a
dispatched run of `cargo test --workspace` on its `main` passed on
2026-11-15 (1785 passed, 0 failed, 53 ignored on purpose).

Studio, rust2, quest, and web-transport check through their Nix dev shells,
so their `pullfrog.yml` gains steps before the agent
([moq-dev/quest#751](https://github.com/moq-dev/quest/pull/751) and the PRs
under `Waiting`): install Nix, put the `/nix/store` entries of `main`'s
`nix print-dev-env` `PATH` on `GITHUB_PATH` (Pullfrog's restricted shell
keeps `PATH` but drops other dev-shell variables, so `nix develop --command`
stays the way to anything needing them), and delete the job token the
installer writes into `/etc/nix/nix.conf`, failing if it remains. The
`pullfrog` environment admits only `main`, so these steps always build the
default branch's shell; `checkout_pr` moves to a PR's head only afterwards,
and `quest context`, now on the agent's PATH, carries the rule against
running a non-writer's PR code.

Remaining: once a repository's workflow change is on `main`, dispatch one
run that runs its checks, such as `gh workflow run pullfrog.yml -R
moq-dev/studio -f prompt='Run just check and just test on main and report
any failure, and how long the workflow steps before the agent took'`, and
check its log. A run that shows another missing tool or variable gets it
added; the setup steps' time goes in the PR that finishes this quest.

## Waiting

- kixel-ai/rust2: merge [kixel-ai/rust2#841](https://github.com/kixel-ai/rust2/pull/841),
  which adds the setup steps; then dispatch its run.
- moq-dev/studio: merge [moq-dev/studio#182](https://github.com/moq-dev/studio/pull/182),
  which adds the setup steps; then dispatch its run.
- moq-dev/web-transport: merge [moq-dev/web-transport#545](https://github.com/moq-dev/web-transport/pull/545),
  which adds the setup steps; then dispatch its run.
