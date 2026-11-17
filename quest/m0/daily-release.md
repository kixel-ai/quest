# [S] Release once a day instead of on every merge

## Goal

Quest cuts at most about one release a day, so each repository that pins it gets
about one bump PR a day instead of four to eight, while an urgent fix can still
reach consumers within the hour through a manual dispatch of Release. Pushes to
`main` no longer cut releases; the daily schedule cuts whatever shipping changes
have piled up since the latest release, and skips the day when none have.

Non-goals: the version rule (before 1.0, a breaking `!` commit bumps the minor
version) stays as it is, and 1.0 and the public release stay
[m1](/quest/m1/README.md)'s.

## Plan

Decided 2026-11-17 (maintainer, /quest-plan), after asking why quest had so
many minor versions and whether to adopt moq-dev/moq's `release` branch. Since
#688 and #717 (decided 2026-11-12), every shipping merge cut a release: 41
releases from 2026-11-13 to 2026-11-17, v0.8.0 to v0.22.0, and about 200
`bump quest` PRs across 11 consumer repositories (33 in moq-dev/moq.dev, 28 in
kixel-ai/rust2, 19 in moq-dev/moq), each running that repository's CI and
taking its merge queue. The minor bumps come from AGENTS.md's no-compatibility
rule, which makes most feature PRs `feat!:`; the number itself is cosmetic
before 1.0, so the churn is what this quest cuts.

- What does this cut? ✅ Releases, and so consumer bump PRs (rejected: only the
  version numbers, such as `!` bumping the patch version before 1.0, which
  leaves the bump churn; gating releases on more checks).
- How are releases batched? ✅ A daily cut from `main` on Release's existing
  06:17 UTC schedule, with pushes to `main` no longer releasing (rejected: a
  moq-dev/moq-style `release` branch, which exists there to run an expensive
  optional gate before publishing many packages, while quest has one artifact
  that Release already builds and checks before publishing, so a second branch,
  ruleset, and cut PR add process and catch nothing new; the watcher
  debouncing bumps, which keeps the release churn and puts the fix in host
  configuration). This supersedes 2026-11-12's "a release, cut on every merge
  that changes what ships" from #688; consumers still pin a release, and the
  watcher's bump pass still follows the latest one.
- How does an urgent fix ship early? ✅ Manual dispatch only:
  `gh workflow run release.yml --ref main` after the fix merges, by the
  maintainer or the agent that lands it (rejected: a `release-now` PR label that
  releases on its push; releasing on any `fix:` commit, since many fixes are
  internal and the churn would creep back).
- ✅ m0: the churn lands on moq-dev's repositories' merge queues and CI now
  (rejected: m1).

Release's pull request runs keep building and checking what ships, so a push
to `main` needs no build of its own. `scripts/release-plan.sh` decides the same
way; only the triggers change. Update CONTRIBUTING.md's Releases section and
SETUP.md's "Every merge that changes what Quest ships becomes a release" to the
daily cut and the dispatch, and the comments at the top of `release.yml`; this
quest is the maintainer's request to edit CONTRIBUTING.md.
