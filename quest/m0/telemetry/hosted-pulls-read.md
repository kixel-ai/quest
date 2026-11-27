# [XS] quest/core names a read of a hosted repository's recently updated PRs

## Goal

`quest/core`'s forge calls name a read of a repository's PRs updated since an instant, merged and closed ones included, each with its number, head branch, state, update time, and body, with request and answer parsers, so Kixel Quest can import it and serve it for a repository it hosts.
The PR sends nothing; [hosted origins](/quest/m0/telemetry/hosted-origins.md) reads it once Kixel Quest serves it.

## Plan

Found 2026-11-27 by the review of hosted origins: today's only PR listing, `pulls`, answers open PRs, so a hosted session whose PR merged before the sender's pass would lose it. This follows the [telemetry epic](/quest/m0/telemetry/README.md)'s order, a shape in `quest/core` before Kixel Quest serves it and any client reads it.

- Recommended: request `{ repository, since }`, `since` in epoch milliseconds; answer newest update first, as `updatedPulls` in `src/cli/usage.ts` reads GitHub's listing, bounded by a page size Kixel Quest sets and a cursor for the next page, so a busy repository's answer stays bounded.
- Only Kixel Quest answers it, for a hosted repository; `GitHubForge` refuses it loudly, since the sender reads GitHub's listing directly.

Tests: the parsers accept the shape and refuse a PR missing a field or a page without its cursor.
