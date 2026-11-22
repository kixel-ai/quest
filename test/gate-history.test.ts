import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
	CHEAP_CPU_MS,
	cheapCores,
	historyDirectory,
	invocationKey,
	readRuns,
	recordRun,
	type Run,
	WINDOW,
} from "../src/cli/gate-history";
import { initRepository, tempDir } from "./fixture";

const cheap: Run = { cpu: CHEAP_CPU_MS - 1, wall: 2 * CHEAP_CPU_MS };
const heavy: Run = { cpu: CHEAP_CPU_MS, wall: CHEAP_CPU_MS };

test("an invocation starts cheap once most of a full window of its latest runs were cheap", () => {
	expect(WINDOW).toBe(5);
	// A first run, or one cheap run of a usually heavy command, exempts nothing.
	expect(cheapCores([])).toBeUndefined();
	expect(cheapCores([cheap, cheap])).toBeUndefined();
	expect(cheapCores([heavy, heavy, cheap, heavy, cheap])).toBeUndefined();
	expect(cheapCores([cheap, cheap, cheap])).toBe(1);
	// Only the latest window counts, so a command that turned heavy queues again within a few runs.
	expect(cheapCores([cheap, cheap, cheap, cheap, cheap, heavy, heavy])).toBe(1);
	expect(cheapCores([cheap, cheap, cheap, cheap, heavy, heavy, heavy])).toBeUndefined();
});

test("a cheap invocation is charged its median run's busy CPUs, rounded up", () => {
	const busy = (cores: number): Run => ({ cpu: 1000, wall: 1000 / cores });
	expect(cheapCores([busy(0.1), busy(0.2), busy(0.3)])).toBe(1);
	expect(cheapCores([busy(1), busy(3.2), busy(8), heavy, busy(2.5)])).toBe(3);
	// A run that took no measurable time is as busy as its CPU time over one millisecond.
	expect(
		cheapCores([
			{ cpu: 3, wall: 0 },
			{ cpu: 3, wall: 0 },
			{ cpu: 3, wall: 0 },
		]),
	).toBe(3);
});

test("runs are kept by month, carried into the next, and pruned two months on", () => {
	const dir = tempDir();
	const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
	for (let i = 0; i < WINDOW + 2; i++) recordRun(dir, "key", { cpu: i, wall: 1 }, day("2026-10-31"));
	expect(readRuns(dir, "key", day("2026-10-31")).map((run) => run.cpu)).toEqual([2, 3, 4, 5, 6]);
	// The next month reads the last until its own first run, which carries the window forward.
	expect(readRuns(dir, "key", day("2026-11-01"))).toHaveLength(WINDOW);
	recordRun(dir, "key", { cpu: 7, wall: 1 }, day("2026-11-01"));
	expect(readRuns(dir, "key", day("2026-11-01")).map((run) => run.cpu)).toEqual([3, 4, 5, 6, 7]);
	recordRun(dir, "other", heavy, day("2026-12-01"));
	expect(readdirSync(dir).sort()).toEqual(["2026-11", "2026-12"]);
	expect(readRuns(dir, "key", day("2027-01-01"))).toEqual([]);
	// A file cut short reads as no runs.
	writeFileSync(join(dir, "2026-12", "other"), "[{");
	expect(readRuns(dir, "other", day("2026-12-02"))).toEqual([]);
});

test("the key is the invocation's repository, shared by its worktrees, directory within it, and arguments", () => {
	const repo = initRepository();
	execFileSync("git", ["commit", "--allow-empty", "-qm", "init"], { cwd: repo });
	const worktree = join(tempDir(), "wt");
	execFileSync("git", ["worktree", "add", "-q", worktree], { cwd: repo });
	mkdirSync(join(repo, "sub"));
	const test = ["bun", "test"];
	expect(invocationKey(test, worktree)).toBe(invocationKey(test, repo));
	expect(invocationKey(test, join(repo, "sub"))).not.toBe(invocationKey(test, repo));
	expect(invocationKey([...test, "a.test.ts"], repo)).not.toBe(invocationKey(test, repo));
	const outside = tempDir();
	expect(invocationKey(test, outside)).not.toBe(invocationKey(test, tempDir()));
	// Only the hash is stored, never the arguments.
	const dir = tempDir();
	const secret = ["deploy", "--token=hunter2"];
	recordRun(dir, invocationKey(secret, repo), cheap);
	const [month] = readdirSync(dir);
	const [file] = readdirSync(join(dir, month!));
	expect(file).toMatch(/^[0-9a-f]{64}$/);
	expect(readFileSync(join(dir, month!, file!), "utf8")).not.toContain("hunter2");
});

test("history sits beside the gate's ledger under the same host name", () => {
	expect(historyDirectory("/home/u/.cache/quest/admissions-v3/host-pid1")).toBe(
		"/home/u/.cache/quest/gate-runs-v1/host-pid1",
	);
});
