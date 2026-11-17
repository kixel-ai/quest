// The rules from `quest context` that a program can check, enforced on an
// agent's tool calls and turn ends by `quest hook` instead of read as prose.
// Each check stays narrow enough to never block legitimate work: it judges
// only what the call or stop itself shows, and lets through what it cannot
// tell apart.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { REFERENCE_MARKER, type Repository, lines } from "../core";
import { hostedRepository, kixelUrl } from "./forge";
import { readRemote, remoteHost } from "./github";
import { parse } from "./shell";

const EM_DASH = String.fromCharCode(0x2014);

/** The prefix with which an agent attests that the user asked, in their own words, for a force-push or rebase. */
export const USER_ASKED = "QUEST_USER_ASKED=1";

/** Each checked rule, as `quest hook` gives it when denying a call that breaks it. */
export const RULES = {
	emDash: "No em dashes in what you write: use a comma, colon, parentheses, or separate sentences. Text quoted from someone else keeps its em dashes on a `>` quote line.",
	footer: "End every GitHub post you author with a `(Written by <model> with <effort>)` line, naming the running model and its reasoning effort, or `(Written by <model>)` when the harness doesn't report the effort; never guess it.",
	refspec:
		"Push with an explicit refspec, `git push <remote> refs/heads/<branch>:refs/heads/<branch>`: a bare branch name can push to the base instead, as under `push.default=upstream` when the branch tracks it.",
	rewrite:
		"Never rebase or force-push, even a branch only you hold; merge the base instead, when the branch conflicts with it or a landing step refuses the head.",
	tmp: "Put scratch files, such as PR bodies, logs, patches, helper scripts, and temporary clones, in the checkout's `.tmp/`, never `/tmp`, so they disappear with the worktree.",
	kixel: "On a repository Kixel Quest hosts, `gh` cannot reach its PRs: use `quest pr view`, `create`, `edit`, `comment`, and `resolve`, and `quest status`, `ready`, and `merge`.",
} as const;

/**
 * The checked rules as a section of `quest context`, for an agent no hook
 * checks them for, such as one whose user never ran `quest setup`. The hook
 * leaves it out of the context it adds.
 */
export const CHECKED_CONTEXT = `## Checked\n\n${Object.values(RULES)
	.map((rule) => `- ${rule}`)
	.join("\n")}\n`;

/**
 * Whether the checkout holding `cwd` points its agents at `quest context`:
 * its root `AGENTS.md` or `CLAUDE.md` has a line starting with Quest's
 * reference marker. Found without running git, since every session waits on it.
 */
export function usesQuest(cwd: string): boolean {
	return questRoot(cwd) !== null;
}

/** The root of the checkout holding `cwd` when it uses Quest, as `usesQuest` decides, or null. */
export function questRoot(cwd: string): string | null {
	for (let dir = cwd; ; dir = dirname(dir)) {
		if (existsSync(join(dir, ".git"))) {
			const uses = ["AGENTS.md", "CLAUDE.md"].some((name) => {
				try {
					return lines(readFileSync(join(dir, name), "utf8")).some((line) =>
						line.startsWith(REFERENCE_MARKER),
					);
				} catch {
					return false;
				}
			});
			return uses ? dir : null;
		}
		if (dirname(dir) === dir) return null;
	}
}

/** The fields of a Claude Code `Stop` or `SubagentStop` hook's JSON input that `runningGates` reads. */
export interface StopInput {
	hook_event_name: string;
	cwd: string;
	/** Stop: the session's transcript. */
	transcript_path?: string;
	/** SubagentStop: the subagent's own transcript; empty where Claude Code keeps none. */
	agent_transcript_path?: string;
	/** The session's background work still in flight, its subagents' included. */
	background_tasks?: { id: string; type: string; command?: string }[];
}

/** A shell command line that runs `quest gate`, directly or through `bun run quest` and the like. */
const GATE = /(^|[^\w-])quest\s+gate(\s|$)/;

/**
 * The `quest gate` commands still running in the background that the agent
 * ending its turn started, in a repository that uses Quest. Claude Code lists
 * the whole session's background work, subagents' included, so a command
 * counts as this agent's when its transcript holds the ID Claude Code gave the
 * command on backgrounding it (`ID: <id>`); without a transcript, every one
 * counts. Claude Code stops a subagent's background commands when it ends, so
 * ending on one loses its result, and it lists a command only while it runs,
 * so a refusal lasts no longer than the gate. Input without the list, from a
 * Claude Code older than it, has none.
 */
export function runningGates(input: StopInput): string[] {
	const gates = (input.background_tasks ?? []).filter(
		(task) => task.type === "shell" && typeof task.command === "string" && GATE.test(task.command),
	);
	if (gates.length === 0 || !usesQuest(input.cwd)) return [];
	const path = input.hook_event_name === "SubagentStop" ? input.agent_transcript_path : input.transcript_path;
	let transcript: string | undefined;
	try {
		transcript = path ? readFileSync(path, "utf8") : undefined;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	return gates
		.filter((task) => transcript === undefined || transcript.includes(`ID: ${task.id}`))
		.map((task) => task.command!);
}

/** What a denial adds to `rewrite`: the way through for a rebase or force-push the user asked for. */
const ASKED = ` If the user asked for this in their own words, prefix the command with \`${USER_ASKED}\`.`;

/** A tool call as Claude Code and Codex hand it to a `PreToolUse` hook. */
export interface ToolCall {
	tool: string;
	input: Record<string, unknown>;
	cwd: string;
}

/** The rules `call` breaks, each said once, in the order of `RULES`; `env` names the Kixel Quest a remote may be on. */
export function broken(call: ToolCall, env: NodeJS.ProcessEnv = process.env): string[] {
	const state = check(call.cwd, env);
	const { found, scratch } = state;
	const text = (key: string) => (typeof call.input[key] === "string" ? (call.input[key] as string) : undefined);
	const path = text("file_path");
	switch (call.tool) {
		case "Bash": {
			const command = text("command");
			if (command !== undefined) shell(command, state);
			break;
		}
		case "Write":
			if (path !== undefined && scratch(path)) found.add("tmp");
			if (path !== undefined && adds(read(call.cwd, path) ?? "", text("content") ?? "")) found.add("emDash");
			break;
		case "Edit":
		case "MultiEdit": {
			if (path !== undefined && scratch(path)) found.add("tmp");
			const edits = Array.isArray(call.input.edits)
				? (call.input.edits as Record<string, unknown>[])
				: [call.input];
			for (const edit of edits)
				if (adds(String(edit.old_string ?? ""), String(edit.new_string ?? ""))) found.add("emDash");
			break;
		}
		case "apply_patch": {
			const patch = text("command");
			if (patch !== undefined) applyPatch(patch, state);
			break;
		}
	}
	return (Object.keys(RULES) as Rule[])
		.filter((key) => found.has(key))
		.map((key) =>
			key === "rewrite"
				? RULES[key] + ASKED
				: key === "kixel" && state.instead
					? `${RULES[key]} Run \`${state.instead}\` instead.`
					: RULES[key],
		);
}

/** Em dashes outside `>` quote lines. */
function dashes(text: string): number {
	let count = 0;
	for (const line of text.split("\n")) if (!/^\s*>/.test(line)) count += line.split(EM_DASH).length - 1;
	return count;
}

/** Whether replacing `before` with `after` writes em dashes of its own, rather than keeping ones already there. */
function adds(before: string, after: string): boolean {
	return dashes(after) > dashes(before);
}

type Rule = keyof typeof RULES;

/** One call's check: the rules found broken so far. */
interface Check {
	found: Set<Rule>;
	cwd: string;
	/**
	 * Whether `path` is scratch under `/tmp` outside the checkout holding `cwd`.
	 * A `$TMPDIR` path is unknown, since `TMPDIR` may name the checkout itself.
	 */
	scratch: (path: string) => boolean;
	/** The hook's environment, which names the Kixel Quest a remote may be on. */
	env: NodeJS.ProcessEnv;
	/** The repository Kixel Quest hosts that the checkout's origin names, or null; read from git on first use. */
	hosted: () => Repository | null;
	/** The `quest` command to run in place of a denied `gh` call, when one does what it asked. */
	instead?: string;
}

function check(cwd: string, env: NodeJS.ProcessEnv): Check {
	const root = checkoutRoot(cwd);
	let hosted: Repository | null | undefined;
	return {
		found: new Set(),
		cwd,
		env,
		scratch: (path) => /^\/tmp(\/|$)/.test(path) && !`${path}/`.startsWith(`${root}/`),
		hosted: () => {
			if (hosted !== undefined) return hosted;
			let origin = null;
			try {
				origin = readRemote(cwd, "origin");
			} catch {
				// Not a checkout, so gh has no repository of its own to reach either.
			}
			const host = origin === null ? null : remoteHost(origin, (url) => hostedRepository(kixelUrl(env), url));
			return (hosted = host?.forge === "kixel" ? host.repository : null);
		},
	};
}

/** The checkout holding `cwd`, found without running git, or `cwd` outside any. */
function checkoutRoot(cwd: string): string {
	for (let dir = cwd; ; dir = dirname(dir)) {
		if (existsSync(join(dir, ".git"))) return dir;
		if (dirname(dir) === dir) return cwd;
	}
}

function read(cwd: string, path: string): string | undefined {
	try {
		return readFileSync(resolve(cwd, path), "utf8");
	} catch {
		return undefined;
	}
}

/** The most a body file may hold to be read: far more than GitHub takes in a post. */
const BODY_LIMIT = 1 << 20;

/**
 * A body file's text, or `undefined` for one that is missing, too large, or
 * not a regular file: a device or pipe may never end, and reading one takes
 * what the command would have read.
 */
function body(cwd: string, path: string): string | undefined {
	try {
		const file = resolve(cwd, path);
		const stat = statSync(file);
		return stat.isFile() && stat.size <= BODY_LIMIT ? readFileSync(file, "utf8") : undefined;
	} catch {
		return undefined;
	}
}

/** The paths that name a command's own stdin. */
const STDIN = new Set(["-", "/dev/stdin", "/dev/fd/0", "/proc/self/fd/0"]);

/** Codex's `apply_patch` envelope: its file headers and its `+`/`-` lines. */
function applyPatch(patch: string, check: Check) {
	let added = "";
	let removed = "";
	for (const line of patch.split("\n")) {
		const header = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
		if (header) {
			if (check.scratch(header[1]!.trim())) check.found.add("tmp");
		} else if (line.startsWith("+")) added += `${line.slice(1)}\n`;
		else if (line.startsWith("-")) removed += `${line.slice(1)}\n`;
	}
	if (adds(removed, added)) check.found.add("emDash");
}

/**
 * The command `argv` runs once wrappers such as `env`, `timeout`, `direnv
 * exec`, `nix develop --command`, and `quest gate` are peeled off, with the
 * variable assignments in front of it added to `env`; `null` for none.
 */
function unwrap(argv: string[], env: Set<string>): string[] | null {
	let rest = argv;
	for (;;) {
		while (rest.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0]!)) env.add(rest.shift()!);
		const [name, ...args] = rest;
		if (name === undefined) return null;
		if (["command", "exec", "nohup", "time", "builtin", "env", "nice"].includes(name)) rest = dropOptions(args);
		else if (name === "timeout") rest = dropOptions(args).slice(1);
		else if (name === "direnv" && args[0] === "exec") rest = args.slice(2);
		else if (name === "quest" && args[0] === "gate") rest = args.slice(1);
		else if (name === "nix" && ["develop", "shell"].includes(args[0] ?? "")) {
			const at = args.findIndex((arg) => arg === "--command" || arg === "-c");
			if (at === -1) return rest;
			rest = args.slice(at + 1);
		} else return rest;
	}
}

/** `args` past its leading options, where `-n`, `-s`, `-k`, `-u`, and `-C` take a value. */
function dropOptions(args: string[]): string[] {
	let i = 0;
	while (i < args.length && args[i]!.startsWith("-")) i += /^-[nskuC]$/.test(args[i]!) ? 2 : 1;
	return args.slice(i);
}

/**
 * Check each simple command in a shell command line, following `sh -c` into
 * its script, which inherits the assignments in `inherited`. A body file is
 * read from disk only for a command that is `alone` on its line: after
 * another command, it may hold something else by the time the line posts it.
 */
function shell(
	line: string,
	check: Check,
	inherited: ReadonlySet<string> = new Set(),
	alone = true,
	elsewhere = false,
) {
	const { found, scratch } = check;
	const commands = parse(line);
	alone &&= commands.length === 1 && !commands[0]!.runs;
	// After a `cd`, gh may run in another checkout than the one the hook reads.
	elsewhere ||= commands.some((simple) => ["cd", "pushd", "popd"].includes(simple.argv[0] ?? ""));
	for (const simple of commands) {
		const env = new Set(inherited);
		const words = [...simple.argv];
		const argv = unwrap(simple.argv, env);
		for (const { op, target } of simple.redirects)
			if ([">", ">>", ">|", "&>", "&>>"].includes(op) && scratch(target)) found.add("tmp");
		if (argv === null) continue;
		const [name, ...args] = argv;
		// A wrapper such as `env --chdir` moves where the command reads a relative path from.
		const moved = words.slice(0, words.length - argv.length).some((word) => /^(-C|--chdir)/.test(word));
		if (["bash", "sh", "zsh", "dash"].includes(name!)) {
			const flag = args.findIndex((arg) => /^-[a-z]*c[a-z]*$/.test(arg));
			if (flag !== -1 && args[flag + 1] !== undefined)
				shell(args[flag + 1]!, check, env, alone && !moved, elsewhere || moved);
			continue;
		}
		const asked = env.has(USER_ASKED);
		const from = (path: string, expanded = false) =>
			alone && !expanded && !path.startsWith("~") && (isAbsolute(path) || !moved)
				? body(check.cwd, path)
				: undefined;
		// Unknown: a here-document or here-string the shell expands, one beside a `<`, since the later wins, and a pipe.
		const fed = simple.redirects.filter(({ op, fd }) => op === "<" && !fd).at(-1);
		const here = simple.stdinExpanded ? undefined : simple.stdin;
		// Read only once a checked command asks, so no other command's input is opened.
		const stdin = () =>
			fed === undefined ? here : simple.stdin === undefined ? from(fed.target, fed.expanded) : undefined;
		const input = (file: string) =>
			STDIN.has(file) ? stdin() : /^\/(dev|proc)\//.test(file) ? undefined : from(file);
		const literal = (value: string) => (simple.expanded?.some((word) => word.endsWith(value)) ? undefined : value);
		if (name === "tee") {
			if (args.some((arg) => !arg.startsWith("-") && scratch(arg))) found.add("tmp");
		} else if (name === "mkdir") {
			if (positionals(args, new Set(["-m", "--mode"])).some(scratch)) found.add("tmp");
		} else if (name === "mktemp") mktemp(args, env, check);
		else if (name === "git") git(args, asked, input, check);
		else if (name === "gh") {
			gh(args, input, literal, check);
			if (!elsewhere && !moved) kixel(args, env, check);
		}
		// `quest pr` posts as `gh pr` does, to GitHub or Kixel Quest, with the same flags, after any `--root`.
		else if (name === "quest") {
			const command = questCommand(args);
			if (command[0] === "pr") gh(command, input, literal, check);
		}
	}
}

/**
 * `mktemp` creates under `$TMPDIR`, which is `/tmp` unless an assignment in
 * `env` sets it, unless given a directory or a template outside it.
 */
function mktemp(args: string[], env: ReadonlySet<string>, check: Check) {
	let dir: string | undefined;
	let tmpdir = false;
	let template: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		// These create nothing.
		if (["--help", "--version", "--dry-run"].includes(arg) || /^-[a-z]*u[a-z]*$/.test(arg)) return;
		if (arg === "-p") dir = args[++i];
		else if (arg.startsWith("--tmpdir=")) dir = arg.slice("--tmpdir=".length);
		else if (arg === "--tmpdir" || /^-[a-z]*t[a-z]*$/.test(arg)) tmpdir = true;
		else if (!arg.startsWith("-")) template = arg;
	}
	const assigned = [...env]
		.filter((assignment) => assignment.startsWith("TMPDIR="))
		.at(-1)
		?.slice("TMPDIR=".length);
	if (dir === undefined && (template === undefined || tmpdir)) dir = assigned || "/tmp";
	if (check.scratch(dir ?? template!)) check.found.add("tmp");
}

/** Options of `git` itself that take the next word. */
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

function git(argv: string[], asked: boolean, input: (file: string) => string | undefined, check: Check) {
	let i = 0;
	while (i < argv.length && argv[i]!.startsWith("-")) i += GIT_VALUE_OPTIONS.has(argv[i]!) ? 2 : 1;
	const [sub, ...args] = argv.slice(i);
	// `-C` moves where git reads a relative message file from.
	const moved = argv.slice(0, i).some((arg) => arg.startsWith("-C"));
	// A help flag anywhere passes, even as an option's value: a missed nudge is cheaper than per-subcommand grammars.
	if (argv.some((arg) => arg === "--help" || arg === "-h")) return;
	if (sub === "push") push(args, asked, check);
	else if (sub === "rebase") {
		if (!asked && !args.some((arg) => ["--abort", "--quit", "--show-current-patch"].includes(arg)))
			check.found.add("rewrite");
	} else if (sub === "pull") {
		const rebase = args.some((arg) => /^(-r|--rebase(=(true|merges|interactive|i))?)$/.test(arg));
		if (rebase && !asked) check.found.add("rewrite");
	} else if (sub === "commit") {
		const message = values(args, ["-m", "--message"], { attached: ["-m"] }).join("\n");
		const files = values(args, ["-F", "--file"], { attached: ["-F"] }).map((file) =>
			moved && file !== "-" && !isAbsolute(file) ? undefined : input(file),
		);
		if (adds("", [message, ...files].join("\n"))) check.found.add("emDash");
	} else if (sub === "clone") {
		// `git clone [options] <repository> [<directory>]` writes only the directory and a separate git directory.
		const written = [positionals(args, CLONE_VALUE_OPTIONS)[1], ...values(args, ["--separate-git-dir"])];
		if (written.some((path) => path !== undefined && check.scratch(path))) check.found.add("tmp");
	} else if (sub === "worktree" && args[0] === "add") {
		// `git worktree add [options] <path> [<commit-ish>]`.
		const path = positionals(args.slice(1), new Set(["-b", "-B", "--reason"]))[0];
		if (path !== undefined && check.scratch(path)) check.found.add("tmp");
	}
}

/** `git clone` options that take the next word. */
const CLONE_VALUE_OPTIONS = new Set([
	"-b",
	"--branch",
	"-o",
	"--origin",
	"-c",
	"--config",
	"-u",
	"--upload-pack",
	"-j",
	"--jobs",
	"--depth",
	"--reference",
	"--reference-if-able",
	"--template",
	"--separate-git-dir",
	"--filter",
	"--shallow-since",
	"--shallow-exclude",
	"--server-option",
	"--bundle-uri",
	"--ref-format",
]);

/** The words in `args` that are not options, nor the values of the options in `valued`. */
function positionals(args: string[], valued: ReadonlySet<string>): string[] {
	const found: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--") return [...found, ...args.slice(i + 1)];
		if (valued.has(args[i]!)) i++;
		else if (!args[i]!.startsWith("-")) found.push(args[i]!);
	}
	return found;
}

/** `git push` options that take the next word. */
const PUSH_VALUE_OPTIONS = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);

function push(args: string[], asked: boolean, check: Check) {
	const positionals: string[] = [];
	const flags: string[] = [];
	let repo = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === "--") positionals.push(...args.slice(i + 1));
		if (arg === "--") break;
		if (arg === "--repo" || arg.startsWith("--repo=")) repo = true;
		if (PUSH_VALUE_OPTIONS.has(arg)) i++;
		else if (arg.startsWith("-")) flags.push(arg);
		else positionals.push(arg);
	}
	// `--repo` names the remote, so every positional is a refspec.
	const refspecs = repo ? positionals : positionals.slice(1);
	const forced =
		refspecs.some((spec) => spec.startsWith("+")) ||
		flags.some((flag) => /^(--force|--force-with-lease(=.*)?|--mirror|-[a-zA-Z]*f[a-zA-Z]*)$/.test(flag));
	if (forced && !asked) check.found.add("rewrite");
	const deleting = flags.some((flag) => flag === "--delete" || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(flag));
	const whole = flags.some((flag) => ["--all", "--branches", "--mirror"].includes(flag));
	// `--tags` pushes every tag beside any refspecs given, which still need a `:`.
	const tagsOnly = flags.includes("--tags") && refspecs.length === 0;
	if (whole || deleting || tagsOnly) return;
	if (refspecs.length === 0 || refspecs.some((spec) => !spec.includes(":"))) check.found.add("refspec");
}

/**
 * The values `args` gives the options in `names`, as `--name value`,
 * `--name=value`, or, for the short options in `attached`, `-nvalue`.
 */
function values(args: string[], names: string[], { attached = [] as string[] } = {}): string[] {
	const found: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		const long = names.find((name) => name.startsWith("--") && arg.startsWith(`${name}=`));
		if (names.includes(arg) && i + 1 < args.length) found.push(args[++i]!);
		else if (long !== undefined) found.push(arg.slice(long.length + 1));
		else {
			const short = attached.find((name) => arg.startsWith(name) && arg.length > name.length);
			if (short !== undefined) found.push(arg.slice(short.length));
		}
	}
	return found;
}

/** `quest`'s arguments past its global options: `--root <path>` or `--root=<path>`. */
function questCommand(args: string[]): string[] {
	let i = 0;
	while (args[i] === "--root" || args[i]?.startsWith("--root=")) i += args[i] === "--root" ? 2 : 1;
	return args.slice(i);
}

/** The `quest` command doing what a `gh pr` subcommand does, on a repository Kixel Quest hosts. */
const QUEST_PR: Record<string, string> = {
	view: "quest pr view",
	create: "quest pr create",
	edit: "quest pr edit",
	comment: "quest pr comment",
	review: "quest pr comment",
	checks: "quest status",
	status: "quest status",
	ready: "quest ready",
	merge: "quest merge",
};

/**
 * `gh pr` options that take the next word, so a URL in one, such as a body, is not taken for the PR. Short forms that
 * are a boolean in another subcommand, such as `review -a` and `merge -r`, `-m`, and `-s`, are left out: their values
 * there, an assignee, reviewer, milestone, or state, are never a URL.
 */
const PR_VALUE_OPTIONS = new Set([
	"-R",
	"--repo",
	"-b",
	"--body",
	"-F",
	"--body-file",
	"-t",
	"--title",
	"--subject",
	"-T",
	"--template",
	"-B",
	"--base",
	"-H",
	"--head",
	"--assignee",
	"-A",
	"--author",
	"-l",
	"--label",
	"--milestone",
	"-p",
	"--project",
	"--reviewer",
	"-q",
	"--jq",
	"--json",
	"-S",
	"--search",
	"--state",
	"-L",
	"--limit",
	"--app",
	"--add-assignee",
	"--remove-assignee",
	"--add-label",
	"--remove-label",
	"--add-reviewer",
	"--remove-reviewer",
	"--add-project",
	"--remove-project",
	"--match-head-commit",
	"--author-email",
	"--color",
]);

/** `gh api` options that take the next word. */
const API_VALUE_OPTIONS = new Set([
	"-X",
	"--method",
	"-f",
	"--raw-field",
	"-F",
	"--field",
	"-H",
	"--header",
	"--hostname",
	"-q",
	"--jq",
	"-t",
	"--template",
	"--input",
	"--cache",
	"-p",
	"--preview",
]);

/**
 * Deny a `gh pr` or `gh api` call aimed at the repository the checkout's origin names on Kixel Quest, which gh
 * cannot reach: one that names no repository, so gh takes the checkout's, or names that one. A call naming another
 * repository, or none gh could tell, such as `gh api graphql`, passes. `env` holds the line's assignments; the
 * process's own `GH_REPO` counts too.
 */
function kixel(args: string[], env: ReadonlySet<string>, check: Check) {
	const [group, command, ...rest] = args;
	if ((group !== "pr" && group !== "api") || args.some((arg) => arg === "--help" || arg === "-h")) return;
	const assigned = [...env].filter((each) => each.startsWith("GH_REPO=")).at(-1);
	const ghRepo =
		assigned === undefined ? check.env.GH_REPO || undefined : assigned.slice("GH_REPO=".length) || undefined;
	// The repository the call names, or null for the checkout's.
	let named: string | null | undefined;
	if (group === "pr") {
		const flag = values(rest, ["-R", "--repo"], { attached: ["-R"] }).at(-1);
		const url = positionals(rest, PR_VALUE_OPTIONS).find((arg) => /^https?:\/\//.test(arg));
		// A PR URL names its repository before `--repo` or `GH_REPO` do.
		named = url ?? flag ?? ghRepo ?? null;
	} else {
		const words = [command ?? "", ...rest];
		const endpoint = positionals(words, API_VALUE_OPTIONS)[0];
		// gh fills these placeholders from the checkout's repository, or `GH_REPO`.
		if (words.some((word) => /\{(owner|repo)\}|:(owner|repo)\b/.test(word))) named = ghRepo ?? null;
		else {
			// A full URL names its host, which is GitHub's API or another forge, never Kixel Quest's.
			if (endpoint === undefined || /^https?:\/\//.test(endpoint)) return;
			const match = /^\/?repos\/([^/?#]+\/[^/?#]+)/.exec(endpoint);
			if (match === null) return;
			named = match[1]!;
		}
	}
	const hosted = check.hosted();
	if (hosted === null) return;
	if (named !== null && !namesHosted(named, hosted, kixelUrl(check.env))) return;
	check.found.add("kixel");
	if (group === "pr") check.instead = QUEST_PR[command ?? ""];
}

/**
 * Whether `value`, as `--repo`, `GH_REPO`, a PR URL, or an endpoint's `OWNER/REPO` gives it, names `hosted` on the
 * Kixel Quest at `base`: a URL there, `HOST/OWNER/REPO` with its host, or `OWNER/REPO` without one, which an agent in
 * that checkout means for its own. A URL or host elsewhere, such as github.com, names another forge's repository.
 */
function namesHosted(value: string, hosted: Repository, base: string): boolean {
	let parts: string[];
	if (/^https?:\/\//.test(value)) {
		if (!value.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return false;
		parts = value
			.slice(base.length + 1)
			.split(/[/?#]/)
			.slice(0, 2);
	} else {
		parts = value.split("/").filter(Boolean);
		if (parts.length === 3 && parts.shift()!.toLowerCase() !== new URL(base).host.toLowerCase()) return false;
	}
	return (
		parts.length === 2 &&
		parts
			.join("/")
			.replace(/\.git$/, "")
			.toLowerCase() === `${hosted.owner}/${hosted.repo}`.toLowerCase()
	);
}

/** `gh` and `quest pr` subcommands that post text, by group and command, and whether each authors a new post. */
const POSTS: Record<string, Record<string, boolean>> = {
	pr: { create: true, comment: true, review: true, edit: false },
	issue: { create: true, comment: true, edit: false },
};

/**
 * Check a `gh` command that posts text. `input` gives a body file's text,
 * `-` being stdin, and `literal` gives a word's text; each is `undefined`
 * when the line does not settle it, and an unknown body passes.
 */
function gh(
	args: string[],
	input: (file: string) => string | undefined,
	literal: (word: string) => string | undefined,
	check: Check,
) {
	const [group, command, ...rest] = args;
	const file = (path: string | undefined) => (path === undefined ? undefined : input(path));
	let body: (string | undefined)[];
	let titles: (string | undefined)[] = [];
	let authored: boolean;
	if (group === "api") {
		const fields = [command ?? "", ...rest];
		const field = (names: string[]) =>
			values(fields, names, { attached: [names[0]!] })
				.filter((value) => value.startsWith("body="))
				.map((value) => literal(value)?.slice("body=".length));
		body = [
			...field(["-f", "--raw-field"]),
			...field(["-F", "--field"]).map((value) => (value?.startsWith("@") ? file(value.slice(1)) : value)),
		];
		const method = values(fields, ["-X", "--method"], { attached: ["-X"] })
			.at(-1)
			?.toUpperCase();
		authored = method !== "PATCH" && method !== "PUT";
	} else {
		const post = POSTS[group ?? ""]?.[command ?? ""];
		if (post === undefined) return;
		// `--edit-last` edits the last comment, even with `--create-if-none`, which only sometimes creates one.
		authored = post && !rest.includes("--edit-last");
		body = [
			...values(rest, ["-b", "--body"], { attached: ["-b"] }).map(literal),
			...values(rest, ["-F", "--body-file"], { attached: ["-F"] }).map((path) => file(literal(path))),
		];
		titles = values(rest, ["-t", "--title"], { attached: ["-t"] }).map(literal);
	}
	if (body.length === 0) return;
	// An unknown body, such as one piped in, one the shell expands, or a file read after another command, passes.
	if (body.some((text) => text === undefined)) return;
	const text = body.join("\n");
	if (authored && adds("", [...titles.filter((title) => title !== undefined), text].join("\n")))
		check.found.add("emDash");
	if (authored && !/(^|\n)\(written by [^\n]+\)\s*$/i.test(text)) check.found.add("footer");
}
