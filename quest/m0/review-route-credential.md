# [S] quest review never sends a login to a gateway

## Goal

When `ANTHROPIC_BASE_URL` routes the Claude reviewer and the environment
holds no credential for it, `quest review` never sends a stored login to
that gateway. When the host manages the provider, as a T3 Code session
does, it drops the host's route and reviews on the stored login directly.
Otherwise it fails before launching the reviewer and names the variables to
set.

## Plan

Decided 2026-11-22 (user, /quest-plan of the follow-up from
[kixel-ai/dotfiles#225](https://github.com/kixel-ai/dotfiles/pull/225)):
✅ refuse and fail loud (rejected: warn and run anyway, which still sends the
login; rejected: drop it, relying on #225, which covers only the
maintainer's own gateways).

Amended 2026-11-22 (maintainer, /quest-plan of the /quest-run follow-ups):
✅ under a host-managed provider, drop the host's route and review on the
stored login (rejected: refuse there too, which fails every review in a T3
session; rejected: pass the host's credential through, which bills the
review through the host's gateway and gives the reviewer's sandbox a
credential it holds today in no other case). Inside a T3 Code session,
`ANTHROPIC_BASE_URL` points at the host's local gateway
(`http://127.0.0.1:8317` on the maintainer's workstation) with
`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` and no credential in the
environment, so the Claude reviewer reports "not logged in". Every agent of
the 2026-11-22 run worked around it with `env -u ANTHROPIC_BASE_URL`.

- `prepare()` in `src/cli/review.ts` keeps `ANTHROPIC_BASE_URL` as a route
  but adds a credential only if one is set. `claude auth status` then passes
  on the stored login, and the reviewer runs with the URL and no credential,
  so Claude Code presumably sends its stored login to the gateway. Confirm
  that against a local listener before fixing it, and put the result in
  `## Validation`.
- Drop `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` from the reviewer's
  environment along with the route, so the reviewer doesn't defer to a host
  it no longer talks to. A host-managed session with no stored login fails
  loud as logged out, as any review without one does.
- A credential is `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`. Decide
  whether an authorization header in `ANTHROPIC_CUSTOM_HEADERS` counts, and
  record why.
- Cloud-provider switches (`CLAUDE_CODE_USE_*`) authenticate through their
  own provider, not the stored login, so they stay as they are unless the
  check above shows otherwise.
- Caused by [moq-dev/quest#424](https://github.com/moq-dev/quest/pull/424),
  which kept the reviewer's gateway routing without requiring a credential
  for it.
