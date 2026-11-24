# [XS] A land fixer's exit 124 reads as timed out

## Goal

When a land fixer's launcher exits 124, the status `timeout(1)` uses and
kixel-ai/dotfiles' fixer client returns when systemd stops the unit at its
runtime limit
([kixel-ai/dotfiles#275](https://github.com/kixel-ai/dotfiles/pull/275)),
the handback comment says `fixer timed out`, not `fixer crashed (exit 124)`.

## Plan

- `exited` in `src/cli/land-fixer.ts` maps 124 to `timed out (exit 124)`
  before its signal lookup, so `settle` writes
  `fixer timed out (exit 124); run /quest-iterate`. Keep the output tail
  beneath it, since the client prints which limit ran out.
- Cover it in the land-fixer tests beside the signal and crash cases: an
  exit file holding `124` gives the timed-out error.
- Rejected: reading the unit's `Result` from systemd here. The fixer may run
  under any launcher, and 124 is the status the client already chose to mean
  a timeout.

## Hosts

- linux - land fixers run on the Linux hosts
