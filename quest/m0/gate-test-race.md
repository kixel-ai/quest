# [XS] Gate tests read their fakes' files only once written

## Goal

`test/gate.test.ts`'s never-started scope tests read the fake `systemctl`'s and `systemd-run`'s files only after the fake has written them whole, so "fails a run whose scope never starts, cancelling its start job without waiting on it" and its siblings no longer fail at random.

## Plan

Decided 2026-11-27 (maintainer, /quest-run): ✅ plan it in m0 (rejected: fix it directly without a quest; drop it).

On 2026-11-27 the merge queue's build of [kixel-ai/quest#931](https://github.com/kixel-ai/quest/pull/931), which touches no gate code, failed that test: it got `''` where it expected `--user stop --no-block <unit>`. The land fixer requeued it unchanged, and it passed 15 of 15 runs there. `neverStarted` waits with `existsSync(args)` and then reads the file, but the fake writes it with `echo "$@" > args`, which creates the file before writing to it. The `pid` and `cancel` files are written and polled the same way.

Caused by [kixel-ai/quest#830](https://github.com/kixel-ai/quest/pull/830), which added these fakes and their polling.

Recommended, for the implementer to confirm: have each fake write to a temporary name and `mv` it into place, so the file exists only when whole. Reproduce first, for example by adding a delay between the fake's create and write, and check the other gate fakes for the same pattern.
