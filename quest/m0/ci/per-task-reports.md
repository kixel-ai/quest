# [S] Upload quest run's per-task reports and delete the kixel-metrics script

## Goal

`platform.yml` uploads the directory `quest run --report` writes as is, `<task>/` and `<task>/<crate>/` reports included, and `scripts/kixel-metrics.ts` and its test are deleted.

Its checks stay: CI still fails naming each malformed `metrics.json` or JUnit report and leaves it out of the upload while the valid reports go up, and the tasks that run after the one that wrote it still run.

Non-goals: changing the `metrics.json` or JUnit formats, and how Kixel Quest reads them.

## Plan

Approved 2026-11-28 (maintainer, `/quest-run`).
[kixel-ai/quest#969](https://github.com/kixel-ai/quest/pull/969) merges each task's reports into one root `junit.xml` and `metrics.json` with a regex script, since Kixel Quest read only an artifact's root. The maintainer accepted its three known gaps for now: a report whose unit clashes with another's is dropped whole, a truncated `<testsuite>` file or a `null` measurement passes, and the classname rewrite can mangle a test name holding `classname="..."`.
Once Kixel Quest reads the per-task layout, the merge has no job left but validation.

Recommendations:

- Move the script's validation into `quest run`'s report collection (`collect` in `src/cli/run.ts`), the one writer of `--report`'s directory, so local runs fail on a malformed report too:
  - `metrics.json` holds `units`, an object of string units, and `samples`, an array.
  - A JUnit file's root is `<testsuites>` or `<testsuite>`, closed at the end.
  - Check against what Kixel Quest's reader refuses, so CI never passes an attempt Kixel Quest would refuse whole. Close the truncated-`<testsuite>` and `null`-measurement gaps that way if the reader refuses them. The other two gaps go with the merge.
  - No XML parser dependency: a root-element check catches a truncated file.
- A malformed report fails the run, not the task:
  - `quest run` names it in an error and leaves it out of `--report`'s directory.
  - It exits nonzero once its tasks finish.
  - The task still passes, so the tasks after it run.
  - Its pass is not recorded in the cache, since a cached pass replays its reports verbatim.
  - Today a `metrics.json` that is not a JSON object fails the task and skips its dependents. Move that check to this rule too. A passing task that wrote no declared report still fails, as now.
- `platform.yml` drops the merge step and uploads `$RUNNER_TEMP/quest-report`, still when `quest run` failed and not when cancelled.
- Carry over `test/kixel-metrics.test.ts`'s refusal cases to `test/run.test.ts`, and add a dependent task that still runs after a malformed report.
- Update the README's `--report` paragraph and its Shared GitHub Actions section to match.

The PR changes a shared workflow, which `RISK.md` rates high. Validate it with a `windows.yml` dispatch like #969's, holding a valid and a malformed report.

## Waiting

- kixel-ai/kixel.quest: its per-task-reports quest deploys, so Kixel Quest reads `<task>/` and `<task>/<crate>/` reports in a `kixel-metrics` artifact. Check that [kixel-ai/kixel.quest#261](https://github.com/kixel-ai/kixel.quest/pull/261) has merged, that `quest/m0/per-task-reports.md` is then gone from kixel-ai/kixel.quest's main (`gh api repos/kixel-ai/kixel.quest/contents/quest/m0/per-task-reports.md` returns 404), and that its newest `deploy` run on main since succeeded. Before #261 merges, the file's absence means nothing.
- kixel-ai/quest: [kixel-ai/quest#969](https://github.com/kixel-ai/quest/pull/969) merges, adding the script and `platform.yml`. Check with `gh pr view 969 --repo kixel-ai/quest --json state` and that `scripts/kixel-metrics.ts` exists on main.

## Related

- [Kixel Quest's per-task-reports quest](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/per-task-reports.md) - teaches Kixel Quest the layout this uploads, planned in [kixel-ai/kixel.quest#261](https://github.com/kixel-ai/kixel.quest/pull/261)
