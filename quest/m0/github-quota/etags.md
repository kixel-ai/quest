# [S] Revalidate every GitHub GET with an ETag

## Goal

Every REST GET quest sends carries `If-None-Match` with the ETag of its last
answer, and a 304, which GitHub does not count against the quota, is served
from a cache that outlives the process. A hundred `quest status` runs on an
unchanged PR then cost the person's quota only what changed.

## Plan

Today only `quest wait` sends ETags (`src/cli/wait.ts`), and only within one
process; the client already takes an `etag` option (`src/github/client.ts`).
Agents run quest as one process per command, so the cache lives on disk.

- Cache in the client, so every GET gets it, and keep the per-endpoint logic
  in `wait.ts` only where it still earns its weight.
- Key each entry by the token's identity as well as the URL: tokens see
  different repositories, so one person's answer is never served to another.
- Store under `XDG_CACHE_HOME`, bounded by size with the oldest entries
  evicted first, and safe for several quest processes at once.
- A page whose `Link` header changes is reread, as `wait.ts` already handles
  a full last page.
- GraphQL has no ETags and its own points budget; this covers REST only.

Tests: a second identical GET sends `If-None-Match` and serves the cached
body on 304; a different token never reads another's entry; concurrent
writers leave a readable cache; and the cache stays within its bound.
