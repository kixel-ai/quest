# [M] Antigravity reviews on a case-insensitive volume

## Goal

`quest review --harness agy` runs on a Mac's default case-insensitive APFS
volume, with the reviewer's reads kept to its turn's directory as on Linux.
`just review-sandbox -t agy` passes there with the reviewer trying each
canary and quoting none, instead of asserting the refusal.

## Plan

Found in [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838).
Antigravity 1.5.14 matches its `read_file(<path>)` deny rules case-sensitively,
by whole components, against the path a read resolves to. On a
case-insensitive volume a read of `/USERS/<user>/.CODEX/auth.json` therefore
passes the rule written for `/Users/<user>/.codex`. Probes on the
maintainer's laptop showed that bracket globs in a rule don't match, and that
dropping `--dangerously-skip-permissions` still lets the read through. #838
refuses agy wherever a directory leading to quest's agent directory matches
names case-insensitively, so on macOS `--harness agy` exits 3 and the
classifier passes on to the next model.

Options for confining reads there:

- Run `agy` under a Seatbelt profile (`sandbox-exec`) that denies file reads
  outside the turn's directory and what agy itself needs, which the reviewer
  can't spell around. That's the only option that works now, so it's the
  recommended one to try first. To find out first: whether Seatbelt matches a
  path's case as the volume resolves it, and what agy reads for itself (its
  install, `~/.gemini`, the Keychain), since a profile around the process
  binds agy's own reads too. Seatbelt is deprecated but still ships, and
  Chromium and Codex's macOS sandbox use it.
- Wait for Google to match rules case-insensitively or add a rule that allows
  only some paths, and check each agy release with
  `just review-sandbox -t agy` on the laptop.
- Leave agy Linux-only, and delete this quest.

## Hosts

- macos - the volume that matches names case-insensitively

## Waiting

- Maintainer: pick the approach above. Seatbelt is recommended. An agent
  can't pick it, because #838's decisions rejected an OS sandbox in favor of
  the head's export, and this would add one on macOS only. Check: a PR
  comment or this quest's Plan records the pick.
