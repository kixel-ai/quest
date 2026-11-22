# [S] quest review never sends Codex's login to a gateway

## Goal

When `OPENAI_BASE_URL` sends the Codex reviewer to a gateway, `quest review`
never sends Codex's stored ChatGPT login to it. A gateway with
`CODEX_API_KEY` or `CODEX_ACCESS_TOKEN` gets that key, even while a stored
login exists. Without one, the review fails before Codex launches and names
the variables to set, as the Claude reviewer's bare gateway does.

## Plan

Found 2026-11-22 while fixing the Claude reviewer's version of this leak.
Codex 0.167.1, given `-c openai_base_url=http://127.0.0.1:<port>/v1` and no key,
sent `Authorization: Bearer <ChatGPT JWT>` and `chatgpt-account-id` to a local
listener.

- `prepare()` in `src/cli/review.ts` treats `OPENAI_BASE_URL` as no route for
  Codex: with a stored login, it strips `CODEX_API_KEY` and Codex sends the
  stored login to the gateway, so a gateway's key loses to the login it was
  meant to replace.
- Make `OPENAI_BASE_URL` a route for Codex, and implement the reviewer's
  `bareGateway` for it. `codex login status` ignores `CODEX_API_KEY`, so the
  route path's status check can't require a pass when the gateway's
  credential is that key; decide which check stands in for it.
- The runner already sets `CODEX_API_KEY` with its proxy's
  `OPENAI_BASE_URL` and a pool `CODEX_HOME`, so it keeps working.
