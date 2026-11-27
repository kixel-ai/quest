// `quest run`: the tasks a repository's quest.toml declares, picked for a tier and a change, each through
// `quest gate` and, for a Nix task, in the repository's dev shell, with every task whose `after` tasks passed
// running at once.
import { type ChildProcess, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
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
import { GROUP, cancelled, follow, interrupts, requested } from "./interrupt";
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

/** Why `tasks` cannot run in a repository with or without a flake.nix: Nix tasks need one. */
function flakeProblem(flake: boolean, tasks: ManifestTask[]): string | null {
	const nix = tasks.filter((task) => task.nix).map((task) => task.name);
	if (nix.length === 0 || flake) return null;
	return `${MANIFEST_FILE}: ${nix.join(", ")} run in the Nix dev shell, but there is no flake.nix; set nix = false on a task that runs without Nix`;
}

/**
 * What `quest check` reports about a repository's quest.toml, if it has one, given how to read a file at its root,
 * null for a file it lacks.
 */
export function manifestProblems(read: (path: string) => string | null): string[] {
	const text = read(MANIFEST_FILE);
	if (text === null) return [];
	const parsed = parseQuestManifest(text);
	if (!parsed.ok) return parsed.problems;
	const problem = flakeProblem(read("flake.nix") !== null, parsed.manifest.tasks);
	return problem === null ? [] : [problem];
}

/**
 * The variable a repository's dev shell sets to its root. `IN_NIX_SHELL` alone cannot tell this repository's dev
 * shell from another's, whose toolchain would then run the task.
 */
export const DEV_SHELL = "QUEST_DEV_SHELL";

/** Whether `env` is a dev shell entered for the repository at `top`. */
function inDevShell(env: NodeJS.ProcessEnv, top: string): boolean {
	const shell = env[DEV_SHELL];
	if (!shell) return false;
	try {
		return realpathSync(shell) === realpathSync(top);
	} catch {
		return false;
	}
}

/** Bash that exports `environment`, each value single-quoted. */
function exports(environment: Record<string, string>): string {
	return Object.entries(environment)
		.map(([name, value]) => `export ${name}='${value.replace(/'/g, `'\\''`)}'\n`)
		.join("");
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
		...paths(["diff", "--name-only", "--no-renames", "--ignore-submodules=none", "-z", base]),
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
	const pick = (os: Host[], only: string[] | null) => pickTasks(manifest, { tier: options.tier, only, changed, os });
	// Checks --only against every requested operating system at once.
	const tasks = pick(options.os, options.only);

	if (options.query) {
		// Each operating system picks its own tasks, and what they run after.
		const include = options.os.flatMap((os) => {
			const here = (name: string) => manifest.tasks.some((task) => task.name === name && task.os.includes(os));
			return pick([os], options.only?.filter(here) ?? null).map((task) => ({
				task: task.name,
				os,
				tier: task.tier,
				after: task.after,
				nix: task.nix,
				capabilities: task.capabilities,
				caches: task.caches,
			}));
		});
		io.stdout(`${JSON.stringify({ include })}\n`);
		return 0;
	}
	if (tasks.length === 0) {
		io.stderr("quest: no task to run\n");
		return 0;
	}

	// Every program is found before any task starts, so a missing one fails the run rather than one task.
	const problem = flakeProblem(existsSync(join(top, "flake.nix")), tasks);
	if (problem !== null) throw new Error(problem);
	// This repository's dev shell, already entered, runs Nix tasks directly with no evaluation.
	const enter = tasks.some((task) => task.nix) && !inDevShell(io.env, top);
	const programs = {
		quest: requireProgram("quest", io.env),
		bash: requireProgram("bash", io.env),
		nix: enter ? requireProgram("nix", io.env) : null,
	};
	// A fresh directory, so no earlier run's report passes for this one's and nothing else in it is touched.
	const report = options.report === undefined ? null : resolve(options.report);
	if (report !== null) {
		if (existsSync(report) && readdirSync(report).length > 0)
			throw new Error(`--report ${options.report} must be a new or empty directory`);
		mkdirSync(report, { recursive: true });
	}
	const env: NodeJS.ProcessEnv = { ...io.env, QUEST_TIER: options.tier };
	if (base !== null) env.QUEST_BASE = base;
	else delete env.QUEST_BASE;
	// Each task's gate leads a process group of its own, out of reach of a terminal's or an enclosing owner's group
	// signals, and this run stands in for them as Quest's group owner does (see `GROUP`): it signals the whole group,
	// so a gate whose enclosing owner holds its command, which then passes on nothing, still stops. Windows has no
	// process groups; its console delivers Ctrl-C to every process.
	const detached = process.platform !== "win32";
	if (detached) env[GROUP] = "1";

	const width = Math.max(...tasks.map((task) => task.name.length));
	const command = (task: ManifestTask): string[] => {
		// The environment applies inside the dev shell, so the gate and Nix keep the caller's PATH.
		const script = ["-eo", "pipefail", "-c", exports(task.environment) + task.run];
		if (task.nix && programs.nix !== null) return [programs.nix, "develop", top, "--command", "bash", ...script];
		return [programs.bash, ...script];
	};

	const outcomes = new Map<string, Outcome>();
	const running = new Map<string, ChildProcess>();
	let stopping = false;
	const cancel = interrupts();
	/** Signal every task: each gate's whole process group, or on Windows end the gate, whose job ends the rest. */
	const signalAll = (signal: NodeJS.Signals) => {
		for (const child of running.values()) {
			if (!detached || child.pid === undefined) child.kill(signal);
			else
				try {
					process.kill(-child.pid!, signal);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
				}
		}
	};
	// As a group owner, the first signal goes to every group and a second kills them.
	const unfollow = follow(
		cancel,
		() => {
			stopping = true;
			if (detached) signalAll(requested(cancel.signal));
		},
		() => {
			if (detached) signalAll("SIGKILL");
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
			/** Record how `task` ended, which `schedule` then acts on. */
			const finish = (task: ManifestTask, outcome: Outcome, line: string) => {
				outcomes.set(task.name, outcome);
				io.stderr(`quest: ${task.name} ${outcome}${line}\n`);
				if (outcome === "failed" && options.failFast && !stopping) {
					stopping = true;
					signalAll("SIGTERM");
				}
			};
			const start = (task: ManifestTask) => {
				const outputs = declared(task);
				try {
					for (const { path } of outputs) rmSync(join(top, path), { force: true });
				} catch (error) {
					finish(task, "failed", `: cannot remove an earlier report: ${(error as Error).message}`);
					return;
				}
				const started = io.now();
				const argv = programCommand(programs.quest, ["gate", ...command(task)], io.env);
				io.stderr(`quest: ${task.name} started\n`);
				const child = spawn(argv.file, argv.args, {
					cwd: top,
					env,
					stdio: ["ignore", "pipe", "pipe"],
					detached,
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
					let problems: string[];
					try {
						problems = collect(top, task, outputs, status === null, report);
					} catch (error) {
						problems = [`cannot collect its reports: ${(error as Error).message}`];
					}
					if (status === null && problems.length === 0) finish(task, "passed", ` in ${seconds}s`);
					else {
						const why = [...(status === null ? [] : [status]), ...problems].join("; ");
						finish(task, stopping && status !== null ? "cancelled" : "failed", ` in ${seconds}s: ${why}`);
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
