# [XS] Fix test/state.test.ts assertion on Windows user profiles

## Goal

`test/state.test.ts` passes on standard native Windows setups where `tmpdir()`
lives inside `%USERPROFILE%\AppData\Local\Temp` instead of failing
`expect(dir.startsWith(join(homedir(), "."))).toBe(false)`.

## Plan

Found 2026-11-27 by replaying `gpt-6.2-sol` (`medium`) on
[kixel-ai/quest#922](https://github.com/kixel-ai/quest/pull/922), which merged
unreviewed under the `low` tier. On standard Windows installations, `tmpdir()`
resolves under `%USERPROFILE%\AppData\Local\Temp` while `join(homedir(), ".")`
resolves to `%USERPROFILE%`, so `dir.startsWith(join(homedir(), "."))` is
`true` even though both `XDG_STATE_HOME` and `XDG_CONFIG_HOME` are isolated in
a fresh `quest-xdg-*` temporary directory (GHA `windows-2022` only passed by
accident because `RUNNER~1` 8.3 short paths didn't match `runneradmin`).

- Caused by: [kixel-ai/quest#922](https://github.com/kixel-ai/quest/pull/922)
  (list under `## Caused by` in the fixing PR).
- In `test/state.test.ts:10`, assert that both `XDG_STATE_HOME` and
  `XDG_CONFIG_HOME` resolve inside the temporary `quest-xdg-` directory under
  `tmpdir()` (and are distinct from the host's default Quest state/config paths
  such as `join(homedir(), ".local", "state")` / `join(homedir(), ".config")`),
  rather than forbidding `tmpdir()` from lying under `homedir()`.

Tests: `bun test test/state.test.ts` passes with `tmpdir()` inside `homedir()`
as well as outside it.
