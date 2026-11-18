# [XS] Point to token-max

## Goal

Quest's `SETUP.md` recommends [token-max](https://github.com/kixel-ai/token-max)
for checking agent settings, and this epic's closing re-measure runs it
beside `quest usage`.

## Plan

Decided 2026-11-05 (user, /quest-plan,
[moq-dev/quest#513](https://github.com/moq-dev/quest/pull/513)): the settings
doctor first planned as `quest doctor` is a standalone CLI with no
quest wrapper. Its plan, survey, and checks moved to kixel-ai/token-max's
own quest tree ([kixel-ai/token-max#1](https://github.com/kixel-ai/token-max/pull/1)),
so this quest keeps only quest's side.

Amended 2026-11-12 (maintainer, /quest-plan,
[moq-dev/quest#677](https://github.com/moq-dev/quest/pull/677), superseding
the text of [moq-dev/quest#670](https://github.com/moq-dev/quest/pull/670)): token-max
moved to the kixel-ai organization
([kixel-ai/token-max#83](https://github.com/kixel-ai/token-max/pull/83)) and
was rewritten in Rust on 2026-11-08 and ships its crate on crates.io and
prebuilt binaries with checksums on GitHub Releases, rejecting npm, which
supersedes the 2026-11-06 npm plan. Point `SETUP.md` at the run-once lines
its install site serves: `curl -LsSf https://max.kixel.ai/run.sh | sh`, and on Windows
`irm https://max.kixel.ai/run.ps1 | iex`. Neither needs a Rust toolchain or
a quest wrapper, and each verifies the binary it downloads against the
release's checksums, as quest's own Windows install does. Still ✅ no npm
package now that the `@kixel` npm scope exists (rejected: cargo-dist's npm
installer for `npx @kixel/token-max`, which adds a release channel and a
GitHub-hosted publish job that `run.ps1` makes unnecessary).

Cleared 2026-11-18: token-max shipped 0.0.1 rather than 0.1.0 (its own m0
decision, 2026-11-14). `curl -fsS -A quest https://crates.io/api/v1/crates/token-max/0.0.1`
names `https://github.com/kixel-ai/token-max` as its repository, the
[v0.0.1 release](https://github.com/kixel-ai/token-max/releases/tag/v0.0.1)
lists Linux, macOS and Windows archives with checksums, and
`https://max.kixel.ai/run.sh` and `run.ps1` are scripts that download the
latest release and check it against its checksums before running
`token-max doctor`. The `cargo install --git` hints in `src/cli/send.ts` and
`src/cli/usage.ts` can now name the published crate:
`cargo install --locked token-max`.
