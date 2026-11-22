// The recent runs of each gated invocation on this host, so the gate can start one whose typical run uses little CPU
// without waiting on the load (see `cheapCores`). Only a hash of the invocation is stored: its arguments may hold secrets.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** One finished run of an invocation: the CPU and wall-clock milliseconds it took once admitted. */
export interface Run {
	cpu: number;
	wall: number;
}

/**
 * The CPU milliseconds under which a run counts as cheap: one core busy for the 5 seconds the gate spaces admissions
 * that only fit the raw load (SETTLE_MS), the least work an admission is assumed to add, so a cheap run cannot overload
 * the host on its own.
 */
export const CHEAP_CPU_MS = 5000;

/** How many of an invocation's latest runs judge it: a majority of these must be cheap. */
export const WINDOW = 5;

/** The history directory beside the gate's ledger `ledger`, under the same host name. */
export function historyDirectory(ledger: string): string {
	return join(dirname(dirname(ledger)), "gate-runs-v1", basename(ledger));
}

/**
 * The key of `command` run in `cwd`: its repository, shared by every worktree, the directory within it, and its full
 * argument list, hashed. Outside a repository, the directory alone stands in for both.
 */
export function invocationKey(command: string[], cwd: string): string {
	const git = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-prefix"], {
		cwd,
		encoding: "utf8",
	});
	if (git.error && (git.error as NodeJS.ErrnoException).code !== "ENOENT") throw git.error;
	const [repository, prefix] = git.status === 0 ? git.stdout.split("\n") : [null, cwd];
	return createHash("sha256")
		.update(JSON.stringify([repository, prefix, command]))
		.digest("hex");
}

/** Runs are kept by UTC month, so dropping a month drops every invocation not run since. */
const month = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/** The month before `ms`'s. */
function previous(ms: number): string {
	const date = new Date(ms);
	return month(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

/** A file cut short, as by power loss, reads as no runs: the invocation only waits on the load again. */
function parse(text: string): Run[] {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return [];
	}
	const valid =
		Array.isArray(value) &&
		value.every(
			(run: Partial<Run>) =>
				Number.isFinite(run?.cpu) && run.cpu! >= 0 && Number.isFinite(run?.wall) && run.wall! >= 0,
		);
	return valid ? (value as Run[]) : [];
}

function readMonth(directory: string, name: string, key: string): Run[] | undefined {
	try {
		return parse(readFileSync(join(directory, name, key), "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

/** The invocation's latest runs, oldest first, from this month or, before its first run this month, the last. */
export function readRuns(directory: string, key: string, now = Date.now()): Run[] {
	return readMonth(directory, month(now), key) ?? readMonth(directory, previous(now), key) ?? [];
}

/**
 * Append `run` to the invocation's latest runs, keeping WINDOW, and drop months before the last. Each write replaces the
 * file whole, so a reader never sees part of one; two gates finishing the same invocation at once keep only one's run.
 */
export function recordRun(directory: string, key: string, run: Run, now = Date.now()): void {
	const runs = [...readRuns(directory, key, now), run].slice(-WINDOW);
	const current = join(directory, month(now));
	mkdirSync(current, { recursive: true, mode: 0o700 });
	const draft = join(current, `${randomUUID()}.tmp`);
	writeFileSync(draft, JSON.stringify(runs), { mode: 0o600 });
	renameSync(draft, join(current, key));
	const kept = [month(now), previous(now)];
	for (const name of readdirSync(directory))
		if (/^\d{4}-\d\d$/.test(name) && !kept.includes(name))
			rmSync(join(directory, name), { recursive: true, force: true });
}

/**
 * The CPUs to charge an invocation that starts without waiting on the load, or undefined while it should wait: once a
 * majority of a full WINDOW of its latest runs was cheap, so its median run is, and one cheap run of a usually heavy
 * command, or a first run, exempts nothing. The charge is its median run's average busy CPUs, rounded up, at least one.
 */
export function cheapCores(runs: Run[]): number | undefined {
	const latest = runs.slice(-WINDOW);
	if (latest.filter((run) => run.cpu < CHEAP_CPU_MS).length * 2 <= WINDOW) return undefined;
	const cores = latest.map((run) => run.cpu / Math.max(run.wall, 1)).sort((a, b) => a - b);
	return Math.max(1, Math.ceil(cores[Math.floor(cores.length / 2)]!));
}
