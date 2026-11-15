# [S] Read on an installation token from Kixel Quest

## Goal

A person signed in to Kixel Quest reads GitHub on a short-lived, read-only
App installation token that Kixel Quest mints, so their reads draw on the
installation's own rate-limit bucket, not their personal 5,000 an hour.
Writes, such as comments, pushes, and merges, stay on the person's token,
so they are made in that person's name.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan`): ✅ Kixel Quest mints the token
(rejected: the App's private key on every host, which would put a key that
writes to every installation on every agent host).

- quest trades the person's Kixel Quest token for an installation token
  scoped to one repository with read permissions, and caches it on disk
  until shortly before it expires.
- Without a Kixel Quest token, or for a repository Kixel Quest does not
  serve, reads use the person's token as today.
- Split the client's dependencies so a read and a write each say which token
  they use; a write on the installation token must not compile.

Tests: with a fake Kixel Quest and a fake GitHub, a read goes out on the
minted token and a write on the person's; the token is minted once and
reused until near expiry; and a repository Kixel Quest does not serve reads
on the person's token.

## Waiting

- kixel-ai/kixel.quest: an endpoint that mints a read-only installation token
  for one repository its caller can read, planned there as
  `quest/m0/installation-tokens.md`. Check that file is gone from its tree.
