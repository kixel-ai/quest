# [M] quest cache push publishes through Kixel Quest with no stored key

## Goal

`quest cache push` builds every flake output listed under `[repo] cache` in `quest.toml` (dev-shell closures included, through `nix develop --profile`) and publishes the missing store paths to `nix.kixel.quest`, holding no B2 key and no signing key:

- It exchanges the job's GitHub Actions OIDC token, or on a Kixel Quest runner the runner's credential, at `kixel.quest` for presigned S3 `PUT` URLs, one per NAR the push names.
- It uploads each NAR to its URL, then sends Kixel Quest each path's `.narinfo` fields, which the Worker signs with the cache's key and writes.
- It names the reused paths in the public CI bucket, and the Worker refreshes each one's 30-day lifetime by copying its objects onto themselves, never silently skipping a path it was asked to keep.
- The Worker picks the bucket from the exchange: a public repository's `main` or tag run writes the public CI or release cache, a private repository only the private one, and anything else is refused, which the command reports as is.

`quest check` verifies that a repository opting into Kixel Quest trusts the cache's public key in its `nixConfig`, alongside the substituter [mkFlake](/quest/m0/ci/nix-lib.md) checks.

## Plan

Decided 2026-11-27 (maintainer, `/quest-run` in kixel-ai/kixel.quest, its `quest/m0/nix-cache.md`): ✅ CI writes through a GitHub Actions OIDC exchange at `kixel.quest`, so no repository or organization holds a write key or signing key (rejected: per-repository environments limited to `main` and tags; organization secrets, which any workflow on a same-repository branch can read). This supersedes the [CI epic](/quest/m0/ci/README.md)'s 2026-11-26 note of separate public and private bucket credentials and a `$NIX_SIGNING_KEY` here.

Decided 2026-11-27 (maintainer, `/quest-run`): ✅ the Worker refreshes a reused path in the public CI bucket by copying its objects onto themselves, one S3 copy per object, with the write keys it already holds. The client only names the paths, and nothing is uploaded twice (rejected: the client uploading again only paths older than 20 days; the client uploading every reused path on each push, which dumps and uploads gigabytes per push for a dev shell). This replaces the re-upload in Kixel Quest's nix-cache quest.

Split out of [mkFlake](/quest/m0/ci/nix-lib.md) on 2026-11-27 (agent's choice), since this half waits on Kixel Quest's Worker and that half does not.

- Per the [telemetry epic](/quest/m0/telemetry/README.md)'s order, Kixel Quest's nix-cache quest lands the exchange's request and answer shapes in `quest/core` first, in a PR that sends nothing; this quest then sends them.
- Recommended: ask the cache which paths it lacks before dumping any NAR, so a push of an unchanged closure uploads nothing but the refresh.
- Recommended: a GitHub job that runs it needs `permissions: id-token: write` and the audience `kixel.quest`; fail naming both when the OIDC request variables are missing, rather than fall back to anything.
- The public key is the second key pair Kixel Quest's nix-cache quest creates (planned as `nix.kixel.quest-2`; nothing trusts `-1`); read it from that deploy.

Tests: against a local Worker and a mocked S3 store, a push from a `main` OIDC token uploads only missing NARs and gets each `.narinfo` signed; a reused path's lifetime is refreshed with no NAR uploaded; a pull-request token, a missing token, and a refused exchange each fail the command with Kixel Quest's reason.

## Waiting

- kixel-ai/kixel.quest: its nix-cache quest (`quest/m0/nix-cache.md`) deploys the exchange, the presigned uploads, `.narinfo` signing, and the in-place refresh of reused paths at `kixel.quest`. Check that the file is gone from that repository's tree and that the deployed Worker answers the refresh request: this client uploads no NAR for a reused path, so it cannot ship before the refresh does, or a reused path past the Worker's recency window fails to sign.

## Related

- [mkFlake](/quest/m0/ci/nix-lib.md) - the flake helper and `nixConfig` check this adds the key to
