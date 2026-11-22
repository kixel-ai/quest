# [XS] The land fixer stops crashing on kixel-ai/rind

## Goal

On kixel-ai/rind, a PR the merge queue drops for `failed_checks` gets a land fixer run that ends in a fix, a flaky verdict, or a handback naming what it needs, never a bare `fixer crashed (exit 1)`. A fixer that does fail hands back with the cause it printed, so the next failure names itself.

## Plan

Planned 2026-11-15 with the maintainer in rind's `/quest-run` of 2026-11-14 and 2026-11-15:

- Every fixer handback that run saw on rind said `Codex land fixer: fixer crashed (exit 1); run /quest-iterate.` (`src/cli/land-fixer.ts`), on kixel-ai/rind#742, #748 (twice), #758 (twice), #786 and #789. The maintainer's session ran `/quest-iterate` by hand each time.
- ✅ m0: the fixer is how the queue watcher (`quest land watch`) absorbs the quest-file conflicts GitHub cannot resolve, so a crashing fixer leaves those for a human (rejected: m1).

Found 2026-11-17 in this quest's first PR, which also makes a failed fixer's handback quote the tail of its own output after the gate's failure:

- Each of those runs' job logs on the maintainer's host holds one line, `quest land check: upload exceeds 256 MiB`: the host's fixer client tars Quest's prepared checkout, `.git` and working tree, and refuses past its 256 MiB upload cap. Quest's checkout for kixel-ai/rind#789 tars to 382 MB, 97 MB of `.git` and 274 MB of working tree (235 MB of it `thirdparty/` test vectors and proofs). Quest's checkout is as small as the round allows (only the base, the PR, and the configured tags and branches), so the cause is in the host's fixer service.
- That fix is kixel-ai/dotfiles' work, per this repository's `AGENTS.md`. ✅ The host's fixer client uploads only `.git` and checks the base out inside the container, since the working tree is `HEAD`'s and the result already returns as `.git`; that puts rind at about 97 MB (rejected: raising the 256 MiB cap; compressing the upload, each of which only defers the next large repository). Settled by the maintainer on 2026-11-17 in moq-dev/quest#763.
- ✅ A failed fixer's handback quotes its output in every repository, public ones included, with tokens redacted before the tail is cut (rejected: private repositories only; never quoting output). Settled by the maintainer on 2026-11-17 in moq-dev/quest#763.
- Finish this quest once rind's next dropped PR gets a real fixer run.

## Waiting

- kixel-ai/dotfiles: its fixer client stops refusing rind's checkout (`quest land check: upload exceeds 256 MiB`), from a quest `/quest-plan` adds there from moq-dev/quest#763's follow-ups. Check that a rind fixer's job log on the maintainer's host (`watch-job-fix-*.json.log` in the rind watcher's state) shows a Codex run, or that rind's next fixer handback names a cause other than the upload.
