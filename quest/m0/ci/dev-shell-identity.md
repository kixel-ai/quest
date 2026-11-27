# [S] Run cached tasks directly in a matching dev shell

## Goal

Inside a `quest.lib.mkFlake` dev shell built from the flake's current inputs, `quest run` runs Nix tasks directly even while the task cache is in use, rather than through a `nix develop` per task and per crate.

## Plan

While the cache is in use, `quest run` runs every Nix task through `nix develop`, even inside the dev shell. An entered shell may predate an edit to the flake, and the cache keys each pass to the shell the flake defines now. `QUEST_DEV_SHELL` cannot settle this alone: `mkFlake`'s shell sets it only while the entered shell matches the current `flake.nix` and `flake.lock`, but that check misses an edit to another Nix file the flake imports.

Recommended:

- `mkFlake`'s shell exports an identity of the toolchain it was built from, such as a hash of its inputs' store paths. It also exposes the same value as a `passthru` attribute, which leaves the shell's derivation unchanged.
- `quest run` reads that attribute in the one `nix eval` it already makes for the cache's fingerprint, and runs Nix tasks directly when the entered shell's identity matches.
- A shell that is not `mkFlake`'s keeps today's behavior.

Tests: a run inside a matching shell starts no `nix develop`, and one inside a stale shell starts one for each Nix task. Measure the time a cached Cargo task saves per crate inside the shell.
