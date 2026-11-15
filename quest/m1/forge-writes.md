# [L] Forge writes for repositories on Kixel Quest

## Goal

On a repository whose forge is Kixel Quest rather than GitHub, quest's Kixel
Quest backend opens, edits, readies, comments on, holds, claims, picks, and
lands pull requests, and resolves review threads, so every quest skill works
there unchanged.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan` in kixel-ai/kixel.quest,
[kixel-ai/kixel.quest#48](https://github.com/kixel-ai/kixel.quest/pull/48)):
our private repositories move onto Cloudflare Artifacts with Kixel Quest as
their whole forge, kixel-ai/kixel.ai first as the pilot; public repositories
stay on GitHub.

- Extend the [forge interface](/quest/m0/github-quota/forge-reads.md) with
  the writes, typed in `quest/core` as its reads are. This quest owns their
  shape: kixel-ai/kixel.quest serves it (`quest/m1/forge/pulls.md` there),
  so build against a fake Kixel Quest and land first.
- A pick names the head the person saw, as `Quest-Land-Head` does on GitHub;
  holds and claims are records keyed by the token quest already treats as
  opaque, not labels.
- A moved repository's remote is a Kixel Quest URL, so the backend for it is
  known from the remote alone.

Tests: against a fake Kixel Quest, quest opens a PR, edits its body, readies
it, resolves a thread, claims and holds it, and queues a pick of its head.

## Required

- [Forge reads](/quest/m0/github-quota/forge-reads.md) - the interface these writes extend
