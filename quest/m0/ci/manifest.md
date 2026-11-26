# [M] quest.toml manifest and quest run CI dispatcher

## Goal

`quest/core` exports a shared `quest.toml` schema and parser (importable by Kixel Quest's Cloudflare Worker without Nix), and `quest run` executes declared CI and lifecycle tasks directly:

- Declares `[repo]` (`merge`, `release`, `cache`, `invalidate_all`) and `[tasks.<name>]` (`tier` among `pr`, `gate`, `nightly`, `release-gate`, `release`; `run`; `after`; `paths`; `exclude`; `inputs`; `caches`; `os`; `capabilities`; `nix`; `cache`; `environment`; `junit`; `metrics`).
- Refuses to run Nix-backed tasks if `flake.nix` is missing (mandatory Nix contract), auto-enters `nix develop --command` when invoked outside the repository's dev shell (with 0ms overhead when already inside it), and respects `nix = false` for non-Nix escape hatches (such as Windows builds or npm OIDC).
- Replaces per-repo `sh/dispatch.sh` / `check.sh` scripts with one tested diff-aware DAG engine: resolves `BASE` (explicit `--base`, `$QUEST_LAND_BASE`, or default branch), selects affected tasks by `paths`/`exclude`/`inputs`/`invalidate_all`, filters tasks by `--os` (defaulting to the host's native OS), runs independent lanes in parallel, supports `--tier`, `--all`, `--only`, `--fail-fast`, and `--query` (JSON matrix output for runners), wraps heavy tasks in `quest gate`, and collects declared JUnit XML and `metrics.json` outputs.
- `quest check` validates `quest.toml` when present alongside the quest tree.

## Plan

Decided 2026-11-26 (maintainer, `/quest-plan`, see the [CI epic](/quest/m0/ci/README.md)):

- ✅ Root `quest.toml` strictly for CI, caching, and release lifecycle tasks (never model or review routing config, keeping Quest's single shipped routing); interactive local dev menus stay in `justfile`.
- ✅ Parser and types live in `quest/core` with zero Node/Nix runtime dependencies so Kixel Quest's Worker imports and validates `quest.toml` directly from git trees.

Implementation notes:

- Export `parseQuestManifest` and typed manifest definitions from `src/core/` (alongside `RISK.md` parsing).
- Pass `QUEST_BASE` to task commands automatically when diff-scoped, and propagate `QUEST_TIER` so repo scripts (like `moq`'s `sh/` scripts) can read the active tier without custom env plumbing.
- Detect whether the current process is already inside the repository's Nix dev shell (via an env marker set by `quest.lib.mkFlake` or `IN_NIX_SHELL`) so local agent loops incur zero Nix evaluation overhead.
- Keep `quest fmt`, `quest test`, `quest gate`, and `quest deploy` as concise shorthands for `quest run` where unambiguous (keeping existing `quest check` for quest-tree validation plus `quest.toml` validation, and `quest gate <cmd>` backward-compatible for raw command gating).

Tests: unit tests covering schema parsing/validation errors, `paths`/`exclude`/`invalidate_all` selection, DAG ordering and `--fail-fast`, `--query` JSON output, missing `flake.nix` refusal, `nix = false` handling, and JUnit/`metrics.json` path collection; integration test running a fixture repo's `quest.toml` end to end.
