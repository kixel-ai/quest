# [M] quest cache push publishes through Kixel Quest with no stored key

## Goal

`quest cache push` builds every flake output listed under `[repo] cache` in `quest.toml` (dev-shell closures included, through `nix develop --profile`) and publishes the missing store paths to `nix.kixel.quest`, holding no B2 key and no signing key:

- It exchanges the job's GitHub Actions OIDC token, or on a Kixel Quest runner the runner's credential, at `kixel.quest` for presigned S3 `PUT` URLs, one per NAR the push names.
- It uploads each NAR to its URL, then sends Kixel Quest each path's `.narinfo` fields, which the Worker signs with the cache's key and writes.
- It refreshes the 30-day lifetime of reused paths in the public CI bucket, never silently skipping a path it was asked to keep.
- The Worker picks the bucket from the exchange: a public repository's `main` or tag run writes the public CI or release cache, a private repository only the private one, and anything else is refused, which the command reports as is.

`quest check` verifies that a repository opting into Kixel Quest trusts the cache's public key in its `nixConfig`, alongside the `https://nix.kixel.quest` substituter it already requires (`cacheProblem` in `src/cli/run.ts`).

## Plan

Decided 2026-11-27 (maintainer, `/quest-run` in kixel-ai/kixel.quest, its `quest/m0/nix-cache.md`): ✅ CI writes through a GitHub Actions OIDC exchange at `kixel.quest`, so no repository or organization holds a write key or signing key (rejected: per-repository environments limited to `main` and tags; organization secrets, which any workflow on a same-repository branch can read). This supersedes the [CI epic](/quest/m0/ci/README.md)'s 2026-11-26 note of separate public and private bucket credentials and a `$NIX_SIGNING_KEY` here.

Split out of the `quest.lib.mkFlake` quest on 2026-11-27 (agent's choice), since this half waits on Kixel Quest's Worker and that half does not.

- Per the [telemetry epic](/quest/m0/telemetry/README.md)'s order, Kixel Quest's nix-cache quest lands the exchange's request and answer shapes in `quest/core` first, in a PR that sends nothing; this quest then sends them.
- Recommended: ask the cache which paths it lacks before dumping any NAR, so a push of an unchanged closure uploads nothing but the refresh.
- Recommended: a GitHub job that runs it needs `permissions: id-token: write` and the audience `kixel.quest`; fail naming both when the OIDC request variables are missing, rather than fall back to anything.
- The public key is the second key pair Kixel Quest's nix-cache quest creates (planned as `nix.kixel.quest-2`; nothing trusts `-1`); read it from that deploy.

Tests: against a local Worker and a mocked S3 store, a push from a `main` OIDC token uploads only missing NARs and gets each `.narinfo` signed; a reused path's lifetime is refreshed; a pull-request token, a missing token, and a refused exchange each fail the command with Kixel Quest's reason.

## Waiting

- Maintainer: how should `quest cache push` refresh the 30-day lifetime of a reused path in the public CI bucket? B2 hides a file 30 days after upload, and the nix-cache decision has the client upload it again, which means dumping and uploading every reused NAR, gigabytes per push for a dev shell.
  - The Worker copies the object onto itself (Recommended) - one S3 copy per path, from Kixel Quest, which already holds the write keys; the client only names the paths, and nothing is uploaded twice
  - The client uploads again only paths older than 20 days - keeps the decided flow, at a NAR dump and upload per reused path about every 20 days
  - The client uploads every reused path on each push - the decided flow as written, the most bandwidth and CI time
- kixel-ai/kixel.quest: its nix-cache quest (`quest/m0/nix-cache.md`) deploys the exchange, the presigned uploads, and `.narinfo` signing at `kixel.quest`. Check that the file is gone from that repository's tree.
