# [S] quest review refuses a gateway with no credential

## Goal

When `ANTHROPIC_BASE_URL` routes the Claude reviewer and the environment
holds no credential for it, `quest review` fails before launching the
reviewer, naming the variables to set. A stored first-party login is never
sent to a gateway.

## Plan

Decided 2026-11-22 (user, /quest-plan of the follow-up from
[kixel-ai/dotfiles#225](https://github.com/kixel-ai/dotfiles/pull/225)):
✅ refuse and fail loud (rejected: warn and run anyway, which still sends the
login; rejected: drop it, relying on #225, which covers only the
maintainer's own gateways).

- `prepare()` in `src/cli/review.ts` keeps `ANTHROPIC_BASE_URL` as a route
  but adds a credential only if one is set. `claude auth status` then passes
  on the stored login, and the reviewer runs with the URL and no credential,
  so Claude Code presumably sends its stored login to the gateway. Confirm
  that against a local listener before fixing it, and put the result in
  `## Validation`.
- A credential is `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`. Decide
  whether an authorization header in `ANTHROPIC_CUSTOM_HEADERS` counts, and
  record why.
- Cloud-provider switches (`CLAUDE_CODE_USE_*`) authenticate through their
  own provider, not the stored login, so they stay as they are unless the
  check above shows otherwise.
- Caused by [moq-dev/quest#424](https://github.com/moq-dev/quest/pull/424),
  which kept the reviewer's gateway routing without requiring a credential
  for it.
