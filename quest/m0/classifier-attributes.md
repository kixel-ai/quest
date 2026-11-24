# [S] The risk classifier sees every hunk, whatever the head's attributes say

## Goal

The risk classifier reads a head's whole change, however the head's
`.gitattributes` marks its files. A head can't hide the hunks that set its
own tier by marking them binary (`-diff`), either in the diff quest puts in
the prompt or in the per-path `git diff` the prompt asks the classifier to
run past the diff budget.

## Plan

Decided 2026-11-23 (maintainer, [on kixel-ai/quest#838's review checkpoint](https://github.com/kixel-ai/quest/pull/838#issuecomment-7123306069)): ✅ keep this quest; on a Git older than 2.41, `quest review` fails with a usage error naming 2.41, checked once at the start (rejected: classify anyway, with the plain diff there; drop the quest).

Found in [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838):
with `src/lib.ts -diff` in the head's `.gitattributes`, the classifier's
prompt (`classify` in `src/cli/review.ts`) shows `Binary files a/src/lib.ts
and b/src/lib.ts differ` instead of the change. The diff dates from
[kixel-ai/quest#716](https://github.com/kixel-ai/quest/pull/716). #838 tried
adding `--attr-source=<empty tree>` to the diff and reverted it, since its
review found the rest of this work:

- The prompt's diff passes `--attr-source=<empty tree>`, as agy's diffs do.
  That also covers an agy classifier, whose prompt carries the same inline
  patch beside its workspace's own diff.
- Past `DIFF_BUDGET`, the prompt holds only the stat and asks the classifier
  to read `git diff <range> -- <path>`. It should name
  `git --attr-source=<empty tree> diff <range> -- <path>` instead, with
  `classifyPrompt`'s test covering it.
- A tier saved before the change stays keyed to the same head, base, and
  risk file, so it's reused without the fixed diff. Add the diff's form to
  the classifier's cache key so those heads classify again.
- `--attr-source` needs Git 2.41 (June 2023), and every `quest review` that
  reaches the classifier would then need it. Ubuntu 22.04 ships 2.34 and
  Debian 12 ships 2.39. Check the version once, before any classifier runs,
  and name 2.41 in the usage error and the README. agy already refuses an
  older Git, since #838, through `attrSource()` in `src/cli/review.ts`, which
  this check can replace.
