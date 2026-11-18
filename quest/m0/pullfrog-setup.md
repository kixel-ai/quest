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
stays the way to anything needing them), and keep the job's token and Nix
daemon trust from the agent: the installer gets no token and leaves the
runner user untrusted, the PATH step alone fetches with the token, and the
job fails if the token reached Nix's config. The
`pullfrog` environment admits only `main`, so these steps always build the
default branch's shell; `checkout_pr` moves to a PR's head only afterwards,
and `quest context`, now on the agent's PATH, carries the rule against
running a non-writer's PR code.

Merged: the setup steps are on `main` in studio, rust2, quest, and
web-transport. Dispatched runs on 2026-11-18 showed them working: the Nix
installer took 6 to 8 seconds and the PATH step 105 to 197 seconds (studio
105, web-transport 106, quest 171, rust2 197), and every run reached
"Run agent" before failing on the credential, so nothing else is missing
before the agent starts.

Remaining: no run has yet run a repository's checks, because Pullfrog's
Claude credential is rate limited until 2026-11-18 06:00 UTC and each
dispatched run failed in seconds with "No configured credential can serve
this run". After the reset, dispatch one run per repository, such as `gh
workflow run pullfrog.yml -R moq-dev/studio -f prompt='Run just check and
just test on main and report any failure, any tool or variable that was
missing, and how long the workflow steps before the agent took'`, and read
its log. A run that shows another missing tool or variable gets it added.
The finishing PR deletes this quest and says in its body that the setup
steps took the times above.

## Waiting

- Pullfrog: its Claude credential resets at 2026-11-18 06:00 UTC; then
  dispatch the run in each of moq-dev/studio, kixel-ai/rust2,
  moq-dev/web-transport, and moq-dev/quest, and check each log with `gh run
  view <id> --log`. A run that still says "No configured credential can
  serve this run" has not reset.
