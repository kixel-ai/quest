// `quest advise`: a stuck agent asks a stronger model, read-only, for a fresh approach to its branch. The first of
// `ADVISORS` that can run answers; each branch gets one answered call unless `--force`, and every call is kept under
// the clone's common Git directory, so `quest usage` and the record sender count it as advising.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { branchQuest } from "../core";
import { git } from "./git";
import { ADVISORS, type AskHarness, type Asked } from "./models";
import {
	type Answer,
	ReviewInputError,
	UnansweredError,
	ask,
	baseInstructions,
	fetchBase,
	parseBase,
	requireAttrSource,
	savedRounds,
	sessionBranch,
} from "./review";
import type { Pins, Session, Spent } from "./usage";

/**
 * What an advisor recommends doing with the PR: revise it, however far, accept the review's open findings as they
 * stand, or drop it.
 */
export const VERDICTS = ["revise", "accept", "drop"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** An advisor's reply. */
export interface Advice {
	approaches: { name: string; summary: string; tradeoffs: string }[];
	/** The name of the approach it recommends. */
	recommendation: string;
	verdict: Verdict;
	/** Whether the recommendation goes beyond the limit the caller's request set; false when it set none. */
	beyond: boolean;
	rationale: string;
	steps: string[];
}

/** The tokens a turn reported, for a CLI whose transcripts token-max cannot read, as agy's. */
export interface Untracked {
	model: string;
	effort: string;
	/** Every input token, cached ones included. */
	input: number;
	cached: number;
	output: number;
	/** The turn's end, epoch ms. */
	end: number;
}

/** One session an advise run started. */
export interface AdviseSession {
	harness: AskHarness;
	model: string;
	effort: string;
	session: string;
	/** Its tokens, for a session token-max cannot read; null when it reported none. */
	usage: Omit<Untracked, "model" | "effort" | "end"> | null;
}

/** One `quest advise` run on a branch. */
export interface Call {
	/** When it started, ISO 8601 UTC, and when it ended. */
	start: string;
	end: string;
	branch: string;
	/** The branch's open PR then, or null. */
	pull: string | null;
	head: string;
	/** The limit the caller's request set, or null. */
	limit: string | null;
	/** Every session that replied, the answering one last, unusable ones first. */
	sessions: AdviseSession[];
	/** The answer, or null when no advisor gave a usable one, which counts toward no cap. */
	advice: Advice | null;
}

interface State {
	branch: string;
	calls: Call[];
}

/** API list prices in USD per million tokens, for models whose transcripts token-max cannot price. */
export const RATES: Record<string, { input: number; cached: number; output: number }> = {
	// Google's paid-tier standard rates, as published pricing summaries listed them on 2026-11-28.
	"gemini-4-neon": { input: 3, cached: 0.15, output: 15 },
};

/** A branch already holds an answered call, and the run was not forced. */
export class AdviseCapError extends Error {}

export interface AdviseOptions {
	root: string;
	/** The base as `<remote>/<branch>`; origin's default branch by default. */
	base?: string;
	branch?: string;
	force?: boolean;
	harness?: AskHarness;
	model?: string;
	effort?: string;
	/** What the caller tried and where it is stuck. */
	question: string;
	/** An explicit limit the request the caller works on states, such as "fix the packaging only". */
	limit?: string;
}

/** A session an advise run started, for the record sender, with the tokens of one token-max cannot read. */
export interface Advising {
	harness: string;
	session: string;
	cwd: string;
	start: number;
	branch: string;
	pull: string | null;
	role: "advising";
	untracked?: Untracked;
}

export interface AdviseDependencies {
	env: NodeJS.ProcessEnv;
	/** The URL and body of the branch's open PR into the base, or null. */
	pull(root: string, base: string, branch: string): Promise<{ url: string; body: string } | null>;
	/** Queues a session for the record sender; must not throw. */
	queue(session: Advising): void;
	now?(): number;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

/** Where a branch's advise calls are kept, under the clone's common Git directory `common`. */
export const adviseFile = (common: string, branch: string) => join(common, "quest", "advise", `${digest(branch)}.json`);

function loadState(path: string, branch: string): State {
	try {
		const state = JSON.parse(readFileSync(path, "utf8")) as State;
		if (!Array.isArray(state?.calls)) throw new ReviewInputError(`${path} holds no advise calls; delete it`);
		return state;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { branch, calls: [] };
		if (error instanceof SyntaxError) throw new ReviewInputError(`${path} is not JSON; delete it`);
		throw error;
	}
}

function saveState(path: string, state: State): void {
	mkdirSync(join(path, ".."), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(state, null, "\t")}\n`);
	renameSync(temporary, path);
}

/** The advisors a run may ask: `ADVISORS`, or only `--harness`'s entry, with `--model` and `--effort` over its own. */
export function advisors(options: Pick<AdviseOptions, "harness" | "model" | "effort">): Asked[] {
	if (options.harness === undefined) {
		if (options.model !== undefined || options.effort !== undefined)
			throw new ReviewInputError("--model and --effort need --harness");
		return [...ADVISORS];
	}
	const listed = ADVISORS.find((entry) => entry.harness === options.harness)!;
	return [{ ...listed, model: options.model ?? listed.model, effort: options.effort ?? listed.effort }];
}

/** The reply's schema; strict, since Codex enforces every property as required. */
export const ADVICE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["approaches", "recommendation", "verdict", "beyond", "rationale", "steps"],
	properties: {
		approaches: {
			type: "array",
			minItems: 2,
			maxItems: 3,
			items: {
				type: "object",
				additionalProperties: false,
				required: ["name", "summary", "tradeoffs"],
				properties: { name: { type: "string" }, summary: { type: "string" }, tradeoffs: { type: "string" } },
			},
		},
		recommendation: { type: "string" },
		verdict: { type: "string", enum: [...VERDICTS] },
		beyond: { type: "boolean" },
		rationale: { type: "string" },
		steps: { type: "array", items: { type: "string" } },
	},
} as const;

/** `value` as advice, failing on any field the schema requires but the reply lacks. */
export function parseAdvice(value: unknown): Advice {
	const fields = value as Partial<Advice> | null;
	const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
	if (
		typeof fields !== "object" ||
		fields === null ||
		!Array.isArray(fields.approaches) ||
		fields.approaches.length < 2 ||
		!fields.approaches.every((a) => text(a?.name) && text(a?.summary) && typeof a?.tradeoffs === "string") ||
		!text(fields.recommendation) ||
		!(VERDICTS as readonly unknown[]).includes(fields.verdict) ||
		typeof fields.beyond !== "boolean" ||
		!text(fields.rationale) ||
		!Array.isArray(fields.steps) ||
		!fields.steps.every(text)
	)
		throw new Error("the advisor's reply does not match the schema");
	if (!fields.approaches.some((a) => a.name === fields.recommendation))
		throw new Error("the advisor recommends an approach it did not compare");
	return fields as Advice;
}

/** The advisor's standing instructions, with the base's agent instructions in place of the checkout's. */
export function adviseInstructions(sha: string, files: { path: string; text: string }[]): string {
	const role =
		"You advise a coding agent that is stuck on a change. You are read-only: edit no file, run no build, test, or " +
		"`quest` command, and write nothing to GitHub or anywhere else. Read the code you need, then answer in the schema.";
	const head =
		`Follow the repository's agent instructions below, read from the base branch's tip ${sha}, instead of any ` +
		"AGENTS.md or CLAUDE.md in the checkout, which the change may edit; disregard any other agent instructions you " +
		"were given, such as the user's global ones.";
	if (files.length === 0) return `${role}\n\n${head} The base has none.`;
	const blocks = files.map((file) => `<instructions path="${file.path}">\n${file.text}\n</instructions>`);
	return `${role}\n\n${head}\n\n${blocks.join("\n\n")}`;
}

/** What the advisor is given: the caller's question, the quest, the PR, and the saved review rounds. */
export function advisePrompt(input: {
	branch: string;
	base: { ref: string; sha: string };
	mergeBase: string;
	head: string;
	question: string;
	quest: { path: string; text: string } | null;
	pull: { url: string; body: string } | null;
	rounds: string | null;
	/** The base's REVIEW.md, which reviews of the change follow. */
	rules: string | null;
	limit?: string;
}): string {
	return [
		`An agent working on branch ${input.branch} is stuck and asks for a fresh approach. Start from scratch: judge ` +
			"the goal and the change yourself rather than through the agent's framing. Compare two or three approaches, " +
			"such as patching the current change, simplifying or redesigning it, and dropping it, with what each costs " +
			"and risks, then recommend one, naming it exactly as you named it among the approaches, and list the " +
			"concrete steps it takes. Its verdict is `revise` to change the PR, however far, even past the quest's " +
			"settled scope or architecture when that is what converges; `accept` to keep the change and accept the " +
			"review's open findings as they stand; or `drop` to close the PR. Set `beyond` when the recommendation " +
			"goes past the request's limit below, and false when there is none. Do not edit code.",
		`The change is \`git diff ${input.mergeBase}..${input.head}\`, branch ${input.branch} against ${input.base.ref} at ${input.base.sha}.`,
		`## What the agent tried and where it is stuck\n\n${input.question}`,
		`## The request's limit\n\n${input.limit ?? "None: the request sets no limit, so `beyond` is false."}`,
		input.quest
			? `## Quest ${input.quest.path}\n\n${input.quest.text}`
			: "## Quest\n\nNo quest file names this branch.",
		input.pull ? `## PR ${input.pull.url}\n\n${input.pull.body}` : "## PR\n\nThe branch has no open PR.",
		`## Review rounds\n\n${input.rounds ?? "No review rounds are saved for this branch."}`,
		...(input.rules === null ? [] : [`## The base's REVIEW.md, which its reviews follow\n\n${input.rules}`]),
	].join("\n\n");
}

/** The file at `path` in the first of `refs` that holds it, or null. */
function shown(root: string, path: string, refs: string[]): string | null {
	for (const ref of refs) {
		try {
			return git(root, ["show", `${ref}:${path}`]);
		} catch {
			// Not at this ref, as a quest file the branch that finishes it deletes.
		}
	}
	return null;
}

/** The quest file a branch names, as the base assigned it, else as the head adds it, or null. */
function questText(root: string, branch: string, refs: string[]): { path: string; text: string } | null {
	if (!branch.startsWith("quest/")) return null;
	const path = branchQuest(branch);
	const text = shown(root, path, refs);
	return text === null ? null : { path, text };
}

/** What `advise` returns: the call it saved, and the answering advisor. */
export interface Advised {
	call: Call & { advice: Advice };
	entry: Asked;
	/** An earlier answered call, which `--force` passed over. */
	forced?: Call;
}

/**
 * Ask the first advisor that can run for a fresh approach to the checkout's branch. Refuses a branch that already
 * holds an answered call unless `force`, before any advisor runs. Every session that replied is saved and queued,
 * answered or not; only an answer counts toward the cap.
 */
export async function advise(options: AdviseOptions, deps: AdviseDependencies): Promise<Advised> {
	const now = deps.now ?? Date.now;
	// Native Windows installs the advisor CLIs as batch shims, which `run` cannot start without a shell.
	if (process.platform === "win32")
		throw new ReviewInputError("quest advise does not support native Windows yet; use WSL");
	const question = options.question.trim();
	const limit = options.limit?.trim() || undefined;
	if (question === "") throw new ReviewInputError("say what you tried and where you are stuck");
	const candidates = advisors(options);
	requireAttrSource();
	const root = git(options.root, ["rev-parse", "--show-toplevel"]);
	const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	const base = await fetchBase(root, options.base);
	const branch = sessionBranch(root, options.branch, parseBase(root, base.ref).branch);
	const path = adviseFile(common, branch);
	const state = loadState(path, branch);
	const prior = [...state.calls].reverse().find((call) => call.advice !== null);
	if (prior !== undefined && !options.force)
		throw new AdviseCapError(
			`${branch} was already advised at ${prior.end} by ${prior.sessions.at(-1)?.model ?? "an advisor"}; ` +
				"each branch gets one call, so act on that advice, or pass --force to ask again",
		);
	const head = git(root, ["rev-parse", "HEAD"]);
	const mergeBase = git(root, ["merge-base", base.sha, head]);
	const changed = git(root, ["diff", "-z", "--name-only", "--no-renames", mergeBase, head])
		.split("\0")
		.filter(Boolean);
	const pull = await deps.pull(root, base.ref, branch);
	const prompt = advisePrompt({
		branch,
		base,
		mergeBase,
		head,
		question,
		quest: questText(root, branch, [base.sha, head]),
		pull,
		rounds: savedRounds(common, branch),
		rules: shown(root, "REVIEW.md", [base.sha]),
		...(limit !== undefined && { limit }),
	});
	// The reply's schema is saved apart from the calls, which `savedAdvice` reads every file of.
	const dir = join(common, "quest", "advise", "schema");
	mkdirSync(dir, { recursive: true });
	const start = now();
	const spent: Answer<unknown, Asked>["spent"] = [];
	let answer: Answer<Advice, Asked> | undefined;
	try {
		answer = await ask(candidates, {
			spent,
			cwd: root,
			dir,
			env: deps.env,
			instructions: adviseInstructions(base.sha, baseInstructions(root, base.sha, changed)),
			schema: ADVICE_SCHEMA,
			prompt,
			head,
			ranges: [`${mergeBase}..${head}`],
			who: "advisor",
			task: "advise",
			parse: parseAdvice,
		});
	} finally {
		// A clock stepped back mid-call would otherwise end the record before it starts, which the store refuses.
		const end = Math.max(start, now());
		const sessions: AdviseSession[] = spent.flatMap(({ entry, usage, session }) =>
			session === undefined
				? []
				: [{ harness: entry.harness, model: entry.model, effort: entry.effort, session, usage }],
		);
		if (sessions.length > 0) {
			const call: Call = {
				start: new Date(start).toISOString(),
				end: new Date(end).toISOString(),
				branch,
				pull: pull?.url ?? null,
				head,
				limit: limit ?? null,
				sessions,
				advice: answer?.value ?? null,
			};
			// Read again, since another run on the branch may have saved a call during this one's turn.
			const saved = loadState(path, branch);
			saved.calls.push(call);
			saveState(path, saved);
			state.calls = saved.calls;
			for (const session of sessions)
				deps.queue({
					harness: session.harness,
					session: session.session,
					cwd: root,
					start,
					branch,
					pull: call.pull,
					role: "advising",
					...(session.harness === "agy" && { untracked: untracked(session, end) }),
				});
		}
	}
	// `ask` returned, so the last call holds its answer.
	return {
		call: state.calls.at(-1) as Call & { advice: Advice },
		entry: answer!.entry,
		...(prior !== undefined && { forced: prior }),
	};
}

/** An agy session's tokens as the sender keeps them, zero when it reported none, which pricing marks incomplete. */
const untracked = (session: AdviseSession, end: number): Untracked => ({
	model: session.model,
	effort: session.effort,
	input: session.usage?.input ?? 0,
	cached: session.usage?.cached ?? 0,
	output: session.usage?.output ?? 0,
	end,
});

/**
 * Untracked tokens priced at `RATES`, split as token-max splits them: input past the cache, and cache reads. The cost is
 * a lower bound, marked incomplete, for a model `RATES` does not list or a turn that reported no tokens.
 */
export function priced(tokens: Untracked): Spent {
	const rate = RATES[tokens.model];
	// A CLI that counts cached tokens apart from its input would make this negative, which no record holds.
	const input = Math.max(0, tokens.input - tokens.cached);
	const cost = rate ? (input * rate.input + tokens.cached * rate.cached + tokens.output * rate.output) / 1e6 : 0;
	return {
		model: tokens.model,
		effort: tokens.effort,
		input,
		cacheWrite: 0,
		cacheRead: tokens.cached,
		output: tokens.output,
		cost,
		complete: rate !== undefined && tokens.input + tokens.output > 0,
	};
}

/** A session token-max cannot read, as `quest usage` and the sender count it, from the tokens its turn reported. */
export function untrackedSession(input: {
	harness: string;
	session: string;
	cwd: string;
	start: number;
	untracked: Untracked;
}): Session {
	const spent = priced(input.untracked);
	return {
		host: null,
		harness: input.harness,
		id: input.session,
		parent: null,
		review: false,
		cwd: input.cwd,
		repositories: null,
		branches: [],
		start: input.start,
		end: input.untracked.end,
		models: [spent],
		cost: spent.cost,
		complete: spent.complete,
		skippedLines: 0,
		files: [],
	};
}

/**
 * The advise calls saved in the clone at `root` that ended since `since`, epoch ms: a pin making each session's role
 * advising on its branch and PR, and a session for each agy turn, which token-max cannot read.
 */
export function savedAdvice(root: string, origin: string, since: number): { pins: Pins; sessions: Session[] } {
	const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	const dir = join(common, "quest", "advise");
	let names: string[];
	try {
		names = readdirSync(dir).filter((name) => name.endsWith(".json"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { pins: new Map(), sessions: [] };
		throw error;
	}
	const pins: Pins = new Map();
	const sessions: Session[] = [];
	for (const name of names) {
		const state = loadState(join(dir, name), "");
		for (const call of state.calls) {
			const end = Date.parse(call.end);
			if (end < since) continue;
			for (const session of call.sessions) {
				pins.set(`${session.harness}\0${session.session}`, {
					pull: call.pull,
					branch: call.branch,
					role: "advising",
					origin,
				});
				if (session.harness === "agy")
					sessions.push(
						untrackedSession({
							harness: session.harness,
							session: session.session,
							cwd: root,
							start: Date.parse(call.start),
							untracked: untracked(session, end),
						}),
					);
			}
		}
	}
	return { pins, sessions };
}

/** Whether no advisor could answer because none could run: each was not installed, logged out, limited, or unsupported. */
export const unavailable = (error: unknown): boolean => error instanceof UnansweredError && error.unavailable;

/**
 * What the caller does with `advice`, given whether its request set a limit: apply a revision, or hand the PR back
 * for the maintainer's pick when the advice would close it, goes past the limit, or accepts the findings, since no
 * record yet tells an advisor's acceptance from the maintainer's.
 */
export function adviceNext(advice: Advice, limited: boolean): string {
	if (advice.verdict === "drop")
		return "next decide: the advisor recommends dropping the PR, which only the maintainer closes; hand it back with the approaches";
	if (limited && advice.beyond)
		return "next decide: the advice goes past the limit your request set; hand the PR back with the approaches";
	if (advice.verdict === "accept")
		return "next decide: the advisor recommends accepting the open findings, which `quest review --accept` would record as the maintainer's; hand the PR back with that recommendation";
	return "next apply: when your task lets you edit and push the PR, take the recommended approach's steps, post a PR comment starting with `Design change:` that says what changed and why, and review it with `quest review --new`; otherwise report the advice";
}

/** The advice as `quest advise` prints it, ending with what the caller does next. */
export function adviceLines({ call, entry, forced }: Advised): string[] {
	const { advice } = call;
	return [
		...(forced ? [`forced past the advice of ${forced.end}`] : []),
		`advisor ${entry.harness} ${entry.model} ${entry.effort}`,
		`verdict ${advice.verdict}${advice.beyond && call.limit !== null ? ", beyond the request's limit" : ""}`,
		`recommendation ${advice.recommendation}`,
		"",
		...advice.approaches.flatMap((a) => [`## ${a.name}`, "", a.summary, "", `Trade-offs: ${a.tradeoffs}`, ""]),
		"## Why",
		"",
		advice.rationale,
		"",
		"## Steps",
		"",
		...advice.steps.map((step, index) => `${index + 1}. ${step}`),
		"",
		adviceNext(advice, call.limit !== null),
	];
}
