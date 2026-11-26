# [M] Content-addressed task and test result caching in quest run

## Goal

`quest run` computes a deterministic content-addressed input digest for each cacheable task (and each Rust workspace crate) and queries Kixel Quest's task-result cache before executing:

- **Input digest:** hashes the active Nix `devShell` store path (pinning the exact compiler and system toolchain), task command, declared environment variables, target OS/arch, and resolved input file blob hashes.
- **Rust crate closure hashing:** for tasks declaring Cargo crate-level discovery (`inputs = "cargo"`), runs `cargo metadata --locked` to resolve each workspace crate's source directory, transitive workspace dependencies, and `Cargo.lock` dependency graph so editing crate B skips running tests for unchanged crate A with a 0ms cache hit.
- **Hit/miss behavior:** on a cache hit from a trusted run, skips execution and replays the cached pass status and JUnit XML; on a miss in a trusted run (when upload credentials are present), uploads the passing outcome and JUnit XML. Tasks setting `cache = false` (smoke tests, live network/interop suites, benchmarks) and `--no-cache` invocations always execute.

## Plan

Decided 2026-11-26 (maintainer, `/quest-plan`, see the [CI epic](/quest/m0/ci/README.md)):

- ✅ Add Layer 3 content-addressed task and test result skipping on top of the Nix binary cache and `mbx` compilation cache, using the Nix `devShell` store path as the exact environment fingerprint and `cargo metadata --locked` for per-crate Rust test skipping (rejected: stopping at git-diff `BASE` path filtering, which cannot reuse passes across rebases, queue rebuilds, hosts, or `main -> release` gates).
- ✅ Keep cache lookups and uploads scoped strictly by repository visibility/credentials through Kixel Quest so public and private caches never cross-read or cross-write.

Implementation notes:

- Exclude build outputs (`target/`, `node_modules/`, `.tmp/`) and respect `.gitignore` when hashing crate/task input trees, hashing git blob/tree hashes where tracked plus working-tree content for dirty local files so local runs and clean CI checkouts produce identical digests.
- Include workspace-level Cargo files (`Cargo.toml`, `Cargo.lock`, `.cargo/config.toml`, `rust-toolchain.toml`) in crate digests only to the extent they affect that crate (e.g., resolved `Cargo.lock` entries for the crate's transitive closure rather than the entire workspace lockfile, so bumping an unrelated crate's dependency does not invalidate every crate).
- Print a clear summary line (`cached (hit) <task>` vs `ran <task> (<duration>)`) and report hit counts in task telemetry.

Tests: fixture multi-crate Cargo workspace test verifying (1) initial trusted run populates digests for crates A and B, (2) editing crate B skips crate A's tests and runs only crate B, (3) changing the `devShell` store path invalidates both, (4) bumping an unrelated dependency in crate B does not invalidate crate A, (5) `cache = false` and `--no-cache` always execute, and (6) untrusted runs read hits without uploading.

## Required

- [quest.toml manifest and quest run](/quest/m0/ci/manifest.md) - provides the task execution engine and manifest fields
