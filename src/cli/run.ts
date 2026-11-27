// `quest run`: the tasks a repository's quest.toml declares, picked for a tier and a change, each through
// `quest gate` and, for a Nix task, in the repository's dev shell, with every task whose `after` tasks passed
// running at once.
import { type ChildProcess, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import {
	type Host,
	MANIFEST_FILE,
	type Manifest,
	type ManifestTask,
	type TaskTier,
	parseQuestManifest,
	pickTasks,
} from "../core";
import { git } from "./git";
import { cancelled, follow, forwards, interrupts, requested } from "./interrupt";
import { programCommand, requireProgram } from "./program";

/** What `quest run` was asked for. */
export interface RunOptions {
	/** A directory in the repository. */
	root: string;
	tier: TaskTier;
	/** Pick every task of the tier, with no base. */
	all: boolean;
	/** Run these tasks whatever their tier or the change, or null to pick by tier. */
	only: string[] | null;
	/** The ref to diff against, or undefined for `$QUEST_LAND_BASE`, then `origin/<[repo] merge>`. */
	base: string | undefined;
	os: Host[];
	/** Stop every task at the first failure. */
	failFast: boolean;
	/** Print the picked tasks as JSON instead of running them. */
	query: boolean;
	/** The directory to copy each task's JUnit XML and metrics into, or undefined. */
	report: string | undefined;
}

/** Where `quest run` writes, what it runs with, and its clock. */
export interface RunIO {
	stdout(text: string): void;
	stderr(text: string): void;
	env: NodeJS.ProcessEnv;
	now(): number;
}

/** The operating system `platform` names, as a manifest's `os` writes it. */
export function nativeOs(platform: NodeJS.Platform = process.platform): Host {
	if (platform === "linux") return "linux";
	if (platform === "darwin") return "macos";
	if (platform === "win32") return "windows";
	throw new Error(`quest run supports linux, macos, and windows, not ${platform}`);
}

/** The repository's manifest, failing with every problem it has. */
function readManifest(top: string): Manifest {
	const path = join(top, MANIFEST_FILE);
	if (!existsSync(path)) throw new Error(`no ${MANIFEST_FILE} at ${top}`);
	const parsed = parseQuestManifest(readFileSync(path, "utf8"));
	if (!parsed.ok) throw new Error(parsed.problems.join("\n"));
	return parsed.manifest;
}

/** Why `tasks` cannot run in the repository at `top`: Nix tasks need its flake.nix. */
function flakeProblem(top: string, tasks: ManifestTask[]): string | null {
	const nix = tasks.filter((task) => task.nix).map((task) => task.name);
	if (nix.length === 0 || existsSync(join(top, "flake.nix"))) return null;
	return `${MANIFEST_FILE}: ${nix.join(", ")} run in the Nix dev shell, but there is no flake.nix; set nix = false on a task that runs without Nix`;
}

/** What `quest check` reports about the quest.toml at `top`, if there is one. */
export function manifestProblems(top: string): string[] {
	const path = join(top, MANIFEST_FILE);
	if (!existsSync(path)) return [];
	const parsed = parseQuestManifest(readFileSync(path, "utf8"));
	if (!parsed.ok) return parsed.problems;
	const problem = flakeProblem(top, parsed.manifest.tasks);
	return problem === null ? [] : [problem];
}

/** The merge base of `ref` and HEAD, and every path changed since, tracked or untracked, both sides of a rename. */
function changes(top: string, ref: string): { base: string; changed: string[] } {
	let base: string;
	try {
		base = git(top, ["merge-base", ref, "HEAD"]);
	} catch (error) {
		throw new Error(
			`cannot find the merge base of ${ref} and HEAD; fetch its history or pass --base: ${(error as Error).message}`,
		);
	}
	const paths = (args: string[]) => git(top, args).split("\0").filter(Boolean);
	const changed = new Set([
		...paths(["diff", "--name-only", "--no-renames", "-z", base]),
		...paths(["ls-files", "--others", "--exclude-standard", "-z"]),
	]);
	return { base, changed: [...changed].sort() };
}

/** Run, or with `query` print, the tasks `options` picks, returning the exit status. */
export async function run(options: RunOptions, io: RunIO): Promise<number> {
	const top = git(options.root, ["rev-parse", "--show-toplevel"]);
	const manifest = readManifest(top);
	let base: string | null = null;
	let changed: string[] | null = null;
	if (!options.all) {
		const ref = options.base ?? (io.env.QUEST_LAND_BASE || `origin/${manifest.repo.merge}`);
		({ base, changed } = changes(top, ref));
		io.stderr(`quest: base ${ref} (${base.slice(0, 12)}), ${changed.length} changed paths\n`);
	}
	const tasks = pickTasks(manifest, { tier: options.tier, only: options.only, changed, os: options.os });

	if (options.query) {
		const include = tasks.flatMap((task) =>
			task.os
				.filter((host) => options.os.includes(host))
				.map((os) => ({
					task: task.name,
					os,
					tier: task.tier,
					after: task.after,
					nix: task.nix,
					capabilities: task.capabilities,
					caches: task.caches,
				})),
		);
		io.stdout(`${JSON.stringify({ include })}\n`);
		return 0;
	}
	if (tasks.length === 0) {
		io.stderr("quest: no task to run\n");
		return 0;
	}

	// Every program is found before any task starts, so a missing one fails the run rather than one task.
	const problem = flakeProblem(top, tasks);
	if (problem !== null) throw new Error(problem);
	// A dev shell already entered, by `nix develop` or direnv, runs Nix tasks directly with no evaluation.
	const enter = tasks.some((task) => task.nix) && !io.env.IN_NIX_SHELL;
	const programs = {
		quest: requireProgram("quest", io.env),
		bash: requireProgram("bash", io.env),
		nix: enter ? requireProgram("nix", io.env) : null,
	};
	const report = options.report === undefined ? null : resolve(options.report);
	const env: NodeJS.ProcessEnv = { ...io.env, QUEST_TIER: options.tier };
	if (base !== null) env.QUEST_BASE = base;

	const width = Math.max(...tasks.map((task) => task.name.length));
	const command = (task: ManifestTask): string[] => {
		const script = ["-eo", "pipefail", "-c", task.run];
		if (task.nix && programs.nix !== null) return [programs.nix, "develop", top, "--command", "bash", ...script];
		return [programs.bash, ...script];
	};

	const outcomes = new Map<string, Outcome>();
	const running = new Map<string, ChildProcess>();
	let stopping = false;
	const cancel = interrupts();
	const signalAll = (signal: NodeJS.Signals) => {
		for (const child of running.values()) child.kill(signal);
	};
	const unfollow = follow(
		cancel,
		() => {
			stopping = true;
			if (forwards(cancel.signal)) signalAll(requested(cancel.signal));
		},
		// The gate takes a second signal as the order to kill everything its command started.
		() => {
			if (forwards(cancel.signal)) signalAll(requested(cancel.signal));
		},
	);
	try {
		await new Promise<void>((done) => {
			const schedule = () => {
				for (const task of tasks) {
					if (outcomes.has(task.name) || running.has(task.name)) continue;
					const before = task.after.map((name) => outcomes.get(name));
					const blocker = task.after.find((name) => {
						const outcome = outcomes.get(name);
						return outcome !== undefined && outcome !== "passed";
					});
					if (blocker !== undefined) {
						outcomes.set(task.name, "skipped");
						io.stderr(`quest: ${task.name} skipped, since ${blocker} did not pass\n`);
					} else if (!stopping && before.every((outcome) => outcome === "passed")) start(task);
				}
				if (running.size === 0) done();
			};
			const start = (task: ManifestTask) => {
				const outputs = declared(task);
				for (const { path } of outputs) rmSync(join(top, path), { force: true });
				if (report !== null) rmSync(join(report, task.name), { recursive: true, force: true });
				const started = io.now();
				const argv = programCommand(programs.quest, ["gate", ...command(task)], io.env);
				io.stderr(`quest: ${task.name} started\n`);
				const child = spawn(argv.file, argv.args, {
					cwd: top,
					env: { ...env, ...task.environment },
					stdio: ["ignore", "pipe", "pipe"],
					windowsVerbatimArguments: argv.windowsVerbatimArguments,
				});
				running.set(task.name, child);
				const prefix = `${task.name.padEnd(width)} | `;
				const lines = [prefixed(prefix, child.stdout!, io.stdout), prefixed(prefix, child.stderr!, io.stderr)];
				let failure: string | null = null;
				child.on("error", (error) => {
					failure = error.message;
				});
				child.on("close", (code, signal) => {
					for (const flush of lines) flush();
					running.delete(task.name);
					const seconds = ((io.now() - started) / 1000).toFixed(1);
					const status = failure ?? (code === 0 ? null : `exit ${code ?? signal}`);
					const problems = collect(top, task, outputs, status === null, report);
					if (status === null && problems.length === 0) {
						outcomes.set(task.name, "passed");
						io.stderr(`quest: ${task.name} passed in ${seconds}s\n`);
					} else {
						outcomes.set(task.name, stopping && status !== null ? "cancelled" : "failed");
						const why = [...(status === null ? [] : [status]), ...problems].join("; ");
						io.stderr(`quest: ${task.name} ${outcomes.get(task.name)} in ${seconds}s: ${why}\n`);
						if (options.failFast && !stopping) {
							stopping = true;
							signalAll("SIGTERM");
						}
					}
					schedule();
				});
			};
			schedule();
		});
	} finally {
		unfollow();
		cancel.close();
	}

	const counts = new Map<Outcome, number>();
	for (const task of tasks) {
		const outcome = outcomes.get(task.name) ?? "skipped";
		counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
	}
	io.stderr(
		`quest: ${OUTCOMES.flatMap((each) => (counts.has(each) ? [`${counts.get(each)} ${each}`] : [])).join(", ")}\n`,
	);
	if (cancel.signal.aborted) return cancelled(cancel.signal);
	return counts.has("failed") || counts.has("cancelled") ? 1 : 0;
}

const OUTCOMES = ["passed", "failed", "cancelled", "skipped"] as const;
type Outcome = (typeof OUTCOMES)[number];

/** The reports `task` declares, each with the name `--report` gives its copy. */
function declared(task: ManifestTask): { path: string; name: string }[] {
	return [
		...(task.junit === null ? [] : [{ path: task.junit, name: "junit.xml" }]),
		...(task.metrics === null ? [] : [{ path: task.metrics, name: "metrics.json" }]),
	];
}

/**
 * Check the reports a task wrote and copy them under `report`, returning what is wrong: a passing task must write
 * every report it declares, and a metrics file must hold a JSON object.
 */
function collect(
	top: string,
	task: ManifestTask,
	outputs: { path: string; name: string }[],
	passed: boolean,
	report: string | null,
): string[] {
	const problems: string[] = [];
	for (const { path, name } of outputs) {
		const file = join(top, path);
		if (!existsSync(file)) {
			if (passed) problems.push(`it did not write ${path}`);
			continue;
		}
		if (name === "metrics.json") {
			let metrics: unknown;
			try {
				metrics = JSON.parse(readFileSync(file, "utf8"));
			} catch {
				metrics = undefined;
			}
			if (typeof metrics !== "object" || metrics === null || Array.isArray(metrics))
				problems.push(`${path} is not a JSON object`);
		}
		if (report !== null) {
			mkdirSync(join(report, task.name), { recursive: true });
			copyFileSync(file, join(report, task.name, name));
		}
	}
	return problems;
}

/** Write each line `stream` carries with `prefix`, returning the function that writes a last unterminated line. */
function prefixed(prefix: string, stream: NodeJS.ReadableStream, write: (text: string) => void): () => void {
	let rest = "";
	stream.setEncoding("utf8");
	stream.on("data", (chunk: string) => {
		const lines = (rest + chunk).split("\n");
		rest = lines.pop()!;
		for (const line of lines) write(`${prefix}${line}\n`);
	});
	return () => {
		if (rest !== "") write(`${prefix}${rest}\n`);
		rest = "";
	};
}
