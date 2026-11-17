# [S] Open PRs' changed files for repositories Kixel Quest hosts

## Goal

Before making a new quest on a repository Kixel Quest hosts, an agent lists
the files each open PR changes through `quest`, as the guide's Creation
section asks, without `gh`.

## Plan

The guide (`assets/AGENTS.md`, Creation) has agents list open PRs' files with
`gh pr list --limit 1000 --json number,url,files` and `gh api` for the rest.
On a repository Kixel Quest hosts, `quest hook` denies both, and no `quest`
command lists them.

Recommendation: give the `pulls` read each open PR's changed paths, print
them with a `quest pr list --files` modeled on `gh pr list`, and have the
guide name it in place of the `gh` commands. Keeping this quest authorizes
that guide edit.
