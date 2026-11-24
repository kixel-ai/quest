# [L] An OS read sandbox for Antigravity reviews

## Goal

Every agy turn quest runs, for `quest review --harness agy` and for the risk
classifier when it falls through to agy, keeps the reviewer's reads to its
turn's directory with an OS sandbox on Linux and macOS, rather than relying only on
agy's own deny rules. The sandbox also covers a file created beside the turn
directory's parents while the turn runs, and a Mac's default
case-insensitive APFS volume. Quest then drops its refusal of
case-insensitive volumes. `just review-sandbox -t agy` passes on both
platforms with the reviewer trying each canary and the sandbox or agy denying
it.

## Plan

Decided 2026-11-23 (maintainer, [on kixel-ai/quest#838's review checkpoint](https://github.com/kixel-ai/quest/pull/838#issuecomment-7123306069)): ✅ keep this quest, widened to an OS read sandbox on both platforms: Seatbelt on macOS, bubblewrap or Landlock on Linux (rejected: drop it, leaving agy Linux-only). #838 itself landed without a sandbox, accepting the documented mid-turn gap, since agy reviews only when `--harness agy` names it and is on no rung yet. The gap also applies whenever the risk classifier falls through to agy, after Claude and Codex cannot run.

What #838 found:

- agy 1.5.14 has no rule that allows only some paths, so quest denies each
  path beside the directories leading to the turn's directory, as the turn's
  start lists them. A file created there while the turn runs is not covered.
- agy matches its `read_file(<path>)` deny rules case-sensitively, by whole
  components, against the path a read resolves to. On a case-insensitive
  volume, a read of `/USERS/<user>/.CODEX/auth.json` therefore passes the rule
  written for `/Users/<user>/.codex`. Probes on the maintainer's laptop showed
  that bracket globs in a rule don't match, and that dropping
  `--dangerously-skip-permissions` still lets the read through. #838 refuses
  agy wherever a directory leading to quest's agent directory matches names
  case-insensitively.
- A denied read comes back as a `read_file` tool step in state `ERROR`, whose
  message ends `Matches user-configured deny rule.`, and the turn goes on.

Guidance:

- A sandbox around the process binds agy's own reads too. Find what agy
  needs: its install, `~/.gemini` (its configuration and, without a keyring,
  its login), the keyring or Keychain, and the network. Keep agy's deny rule on
  its own store, which the reviewer must not quote and agy must still read.
- macOS: a `sandbox-exec` profile allowing file reads only under the turn's
  directory and what agy needs. Check that Seatbelt matches a path as the
  volume resolves it, so `/USERS/...` can't pass a rule for `/Users`. Seatbelt
  is deprecated but still ships, and Codex's macOS sandbox uses it.
- Linux: bubblewrap binding only those paths, or Landlock read rules applied
  by a small launcher. Pick by what the host has without root: unprivileged
  user namespaces for bubblewrap, kernel 5.13 or later for Landlock.
- Decide at setup from known capabilities, and refuse agy where neither
  sandbox can run, rather than falling back to the deny rules alone.

## Hosts

- linux - bubblewrap or Landlock
- macos - Seatbelt, and the case-insensitive volume
