// What quest reads from a forge, as one interface with a backend per forge: pull request, check, review, hold, and
// queue state, claims, and activity to wait on. Its types are the wire format Kixel Quest serves them in, so both
// sides parse the same shapes and neither guesses.
import { TIERS, type Tier } from "./risk";

/** A repository on its forge, by owner and name. */
export interface Repository {
	owner: string;
	repo: string;
}

/** A pull request by its repository and number. */
export interface PullRequest extends Repository {
	number: number;
}

/** A bad argument, such as a malformed PR or wait point, reported as a usage error. */
export class InputError extends Error {}

/** A check run or commit status on the head, as `quest status` prints it. */
export interface Check {
	name: string;
	required: boolean;
	/** The lowercased check-run conclusion or status, or commit-status state. */
	result: string;
	url: string | null;
}

/** A reviewer's latest submitted review. */
export interface Review {
	reviewer: string;
	/** approved, changes_requested, commented, or dismissed. */
	state: string;
	/** Whether the review was submitted against the current head. */
	current: boolean;
	commit: string | null;
	submittedAt: string;
	url: string;
}

/** A reaction on the PR or one of its reviews. */
export interface Reaction {
	content: string;
	actor: string;
	createdAt: string;
	/** The PR or review reacted to. */
	url: string;
}

/** An unresolved review thread. */
export interface Thread {
	id: string;
	path: string;
	/** The line on the current diff, or the original line once outdated. */
	line: number | null;
	outdated: boolean;
	lastAuthor: string;
	/** The thread's latest comment. */
	url: string;
}

/**
 * The head the PR body's `## Review` section names last, the latest reviewed one: a round's record, or a line after
 * it for low-severity fixes or a skip. `current` is the PR's head; `diff-identical` an earlier head whose diff from
 * the base (`git diff <base>...<sha>`) matches the head's; `unknown` one the forge cannot compare, such as a diff too
 * large to render.
 */
export interface ReviewRecord {
	state: "current" | "diff-identical" | "stale" | "unknown";
	head: string;
}

/** One signal on a PR's head that holds it from landing until it is fixed or answered. */
export interface Signal {
	/** `finding`: an online reviewer's, on the head. `decision`: a marked comment newer than the head's commit. */
	kind: "finding" | "decision";
	/** The review, thread, or comment that raised it. */
	url: string;
	author: string;
	/** The finding's title or thread's first line, or the decision's first line. */
	text: string;
}

/** A hold label on a PR, and the event that took it when the timeline still shows it. */
export interface HoldFact {
	label: string;
	/** Null when the acquisition is older than the available timeline. */
	token: string | null;
	takenAt: string | null;
	age: string | null;
	/** The forge's verified event URL; the opaque token is not a browser anchor. */
	eventUrl: string | null;
}

/** A draft its starter still holds: one not handed back with `## Waiting`. */
export interface StarterHold {
	lastActive: string;
	age: string;
	url: string;
}

/** Everything `quest status` reports about a PR. */
export interface Status {
	url: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	head: string;
	mergeable: string;
	mergeState: string;
	reviewDecision: string | null;
	/** `head` is the head it was enabled on, or null when that cannot be told. */
	autoMerge: { method: string; enabledBy: string; enabledAt: string; head: string | null } | null;
	mergeQueue: { state: string; position: number; enqueuedAt: string } | null;
	/**
	 * The latest exit from the merge queue, auto-merge, or `quest land`'s queue, and the reason for it;
	 * null once the PR is queued again.
	 */
	landingStopped: { reason: string; actor: string; at: string } | null;
	checks: { state: string | null; passed: number; failing: Check[]; pending: Check[] };
	/** Each reviewer's latest submitted review, oldest first. */
	reviews: Review[];
	/** The design checkpoints online reviewers put on the head. */
	checkpoints: { reviewer: string; round: number; url: string }[];
	/** Null when the `## Review` section names no full SHA. */
	reviewRecord: ReviewRecord | null;
	/**
	 * The head's risk tier as the `## Review` record names it, and the classifier's own tier, lower when a reviewer
	 * raised it; null when the record names none. `state` is the review record's, which a line after it carries to a
	 * later head, else `current` when the record names the head and `stale` when not.
	 */
	risk: { tier: Tier; reason: string; classified: Tier; state: ReviewRecord["state"] } | null;
	reactions: Reaction[];
	/** Unresolved review threads, oldest first. */
	threads: Thread[];
	/** What holds the head from landing: online reviewers' unanswered findings on it and newer maintainer decisions. */
	signals: Signal[];
	holds: HoldFact[];
	starterHold: StarterHold | null;
}

/** An open PR, from any head repository, as the claim checks read it. */
export interface OpenPull {
	number: number;
	url: string;
	branch: string;
	/** The head repository as `owner/repo`, or `null` once a fork is deleted. */
	head: string | null;
	draft: boolean;
	/** Epoch milliseconds. The earliest open PR on a branch holds the claim. */
	created: number;
	/** Epoch milliseconds of the last push, comment, or edit. */
	updated: number;
	/** Its body has a `## Waiting` section, so it waits on the maintainer. */
	handedBack: boolean;
	body: string;
}

/** A held quest branch, and the open PR from it if there is one. */
export interface Claim {
	branch: string;
	/** The PR holding the claim: the earliest open one. */
	url: string | null;
	pull: OpenPull | null;
}

/** Which branches someone holds, and which landed branches a new claim replaces. */
export interface Holdings {
	/** Sorted by branch. */
	claims: Claim[];
	/**
	 * Branches in the head fork, or upstream without one, whose tip is the head of a merged PR, by
	 * that tip. Their work landed, so they hold nothing and a claim may replace them.
	 */
	landed: Map<string, string>;
}

/** A repository claim branches live in, and its `quest/*` branch tips when the caller already read them. */
export interface ClaimSource {
	repository: Repository;
	tips?: Map<string, string>;
}

/** Where claims live: the upstream repository, and the fork a contributor pushes claims to, if any. */
export interface ClaimSources {
	upstream: ClaimSource;
	/** Absent when claims are pushed upstream. */
	fork?: ClaimSource;
}

/** One line of `quest wait`'s output: when (a timestamp or commit SHA), what, who, and where. */
export interface WaitEvent {
	point: string;
	type: string;
	actor: string;
	url: string;
}

/** One poll of a PR's activity: what is new, in order, and where the next poll resumes. */
export interface WatchPoll {
	events: WaitEvent[];
	/** Opaque to the caller; `quest wait --since` takes it back. */
	cursor: string;
	/** The least time to the next poll the forge asks for, in milliseconds; 0 for none. */
	pollInterval: number;
}

/** A forge's answer, and the time of the newest webhook behind it, or null for a live read from the forge itself. */
export interface Answer<T> {
	value: T;
	asOf: string | null;
}

/** Polls of one PR's activity, each resuming where the last stopped. */
export interface Watch {
	/** Where a wait that times out now resumes: the latest cursor, else the point it started from, once known. */
	readonly resume: string | undefined;
	/** The activity since the last poll, or since the starting point on the first. */
	poll(): Promise<Answer<WatchPoll>>;
}

/** Where a watch starts, and when it gives up: epoch milliseconds, or Infinity. */
export interface WatchOptions {
	/** An ISO timestamp, a pushed SHA, or a cursor; the head's push time when absent. */
	since?: string;
	deadline: number;
	/** When the wait began, epoch milliseconds; where a backend resumes before it knows the head. Now when absent. */
	started?: number;
}

/** The reads quest makes of a forge. */
export interface Forge {
	/** What it is called in messages, such as `GitHub`. */
	readonly name: string;
	/** The person reading: whose own activity `quest wait` ignores, whichever credential serves the reads. */
	viewer(): Promise<string>;
	/** A PR's state, as `quest status` prints it. */
	status(pull: PullRequest): Promise<Answer<Status>>;
	/** Every open PR in `repository`, from any head repository. */
	pulls(repository: Repository): Promise<Answer<OpenPull[]>>;
	/** Which of `branches` someone holds, as `quest start` decides it. */
	held(sources: ClaimSources, branches: string[]): Promise<Answer<Holdings>>;
	/** Polls of a PR's activity, starting from `options.since`. */
	watch(pull: PullRequest, options: WatchOptions): Watch;
}

/** Each read Kixel Quest serves at `POST /forge/<call>`: the request it takes and the value it answers. */
export interface ForgeCalls {
	status: { request: { pull: PullRequest }; value: Status };
	pulls: { request: { repository: Repository }; value: OpenPull[] };
	held: { request: { sources: ClaimSources; branches: string[] }; value: Holdings };
	/** `from` is a `--since` point or a cursor; null starts at the head's push time. */
	watch: { request: { pull: PullRequest; from: string | null }; value: WatchPoll };
}

/** A read Kixel Quest serves. */
export type ForgeCall = keyof ForgeCalls;

/** The calls, as their paths name them. */
export const FORGE_CALLS: readonly ForgeCall[] = ["status", "pulls", "held", "watch"];

/** `GET /forge`: the person a token names and the repositories, as lowercase `owner/repo`, read through Kixel Quest. */
export interface ForgeInfo {
	login: string;
	repositories: string[];
}

/** `value` as JSON: maps become objects. */
export function forgeJson(value: unknown): string {
	return JSON.stringify(value, (_, entry: unknown) => (entry instanceof Map ? Object.fromEntries(entry) : entry));
}

/** A `GET /forge` answer, failing on any missing, extra, or ill-typed field. */
export function parseForgeInfo(value: unknown): ForgeInfo {
	return info(value, "info");
}

/** A request for `call`, failing on any missing, extra, or ill-typed field. */
export function parseForgeRequest<C extends ForgeCall>(call: C, value: unknown): ForgeCalls[C]["request"] {
	return REQUESTS[call](value, "request") as ForgeCalls[C]["request"];
}

/** An answer to `call`, failing on any missing, extra, or ill-typed field. */
export function parseForgeAnswer<C extends ForgeCall>(call: C, value: unknown): Answer<ForgeCalls[C]["value"]> {
	return answer(VALUES[call])(value, "answer") as Answer<ForgeCalls[C]["value"]>;
}

/** Parses untrusted JSON at a path named for its error, such as `answer.value.checks`. */
type Parse<T> = (value: unknown, at: string) => T;

const fail = (at: string, expected: string): never => {
	throw new Error(`malformed forge ${at}: expected ${expected}`);
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const string: Parse<string> = (value, at) => (typeof value === "string" ? value : fail(at, "a string"));
const name: Parse<string> = (value, at) => (typeof value === "string" && value !== "" ? value : fail(at, "a name"));
const boolean: Parse<boolean> = (value, at) => (typeof value === "boolean" ? value : fail(at, "a boolean"));
const count: Parse<number> = (value, at) =>
	Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : fail(at, "a count");
const time: Parse<string> = (value, at) =>
	typeof value === "string" &&
	/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
	!Number.isNaN(Date.parse(value))
		? value
		: fail(at, "an ISO 8601 timestamp");
const oneOf =
	<T extends string>(options: readonly T[]): Parse<T> =>
	(value, at) =>
		options.includes(value as T) ? (value as T) : fail(at, `one of ${options.join(", ")}`);
const nullable =
	<T>(parse: Parse<T>): Parse<T | null> =>
	(value, at) =>
		value === null ? null : parse(value, at);
const list =
	<T>(parse: Parse<T>): Parse<T[]> =>
	(value, at) =>
		Array.isArray(value) ? value.map((entry, index) => parse(entry, `${at}[${index}]`)) : fail(at, "a list");
/** An object of exactly these fields, rebuilt in their order so JSON output stays deterministic. */
const shape =
	<T>(fields: { [K in keyof T]-?: Parse<T[K]> }): Parse<T> =>
	(value, at) => {
		if (!isRecord(value)) return fail(at, "an object");
		const extra = Object.keys(value).find((key) => !Object.hasOwn(fields, key));
		if (extra !== undefined) fail(`${at}.${extra}`, "no such field");
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(fields) as (keyof T & string)[]) {
			const field = (fields as Record<string, Parse<unknown>>)[key]!;
			if (Object.hasOwn(value, key)) out[key] = field(value[key], `${at}.${key}`);
			else if (!optional.has(field)) fail(`${at}.${key}`, "a value");
		}
		return out as T;
	};
/** Fields a shape may leave out. */
const optional = new WeakSet<Parse<unknown>>();
const maybe = <T>(parse: Parse<T>): Parse<T | undefined> => {
	const parsed: Parse<T | undefined> = (value, at) => parse(value, at);
	optional.add(parsed);
	return parsed;
};
/** A JSON object of names to values, as a map. */
const mapOf =
	(key: Parse<string>, entry: Parse<string>): Parse<Map<string, string>> =>
	(value, at) => {
		if (!isRecord(value)) return fail(at, "an object");
		return new Map(Object.entries(value).map(([k, v]) => [key(k, `${at} key`), entry(v, `${at}.${k}`)]));
	};

const sha: Parse<string> = (value, at) =>
	typeof value === "string" && /^[0-9a-f]{40}$/.test(value) ? value : fail(at, "a full commit SHA");
const branch: Parse<string> = (value, at) =>
	typeof value === "string" && value.startsWith("quest/") ? value : fail(at, "a quest branch");
const repository = shape<Repository>({ owner: name, repo: name });
const pullRequest: Parse<PullRequest> = (value, at) => {
	const pull = shape<PullRequest>({ owner: name, repo: name, number: count })(value, at);
	return pull.number > 0 ? pull : fail(`${at}.number`, "a PR number");
};
const check = shape<Check>({ name: string, required: boolean, result: string, url: nullable(string) });
const reviewStates = ["current", "diff-identical", "stale", "unknown"] as const;
const tier = oneOf<Tier>(TIERS);

const status = shape<Status>({
	url: string,
	state: oneOf(["open", "closed", "merged"]),
	draft: boolean,
	head: string,
	mergeable: string,
	mergeState: string,
	reviewDecision: nullable(string),
	autoMerge: nullable(
		shape<NonNullable<Status["autoMerge"]>>({
			method: string,
			enabledBy: string,
			enabledAt: time,
			head: nullable(string),
		}),
	),
	mergeQueue: nullable(
		shape<NonNullable<Status["mergeQueue"]>>({ state: string, position: count, enqueuedAt: time }),
	),
	landingStopped: nullable(shape<NonNullable<Status["landingStopped"]>>({ reason: string, actor: string, at: time })),
	checks: shape<Status["checks"]>({
		state: nullable(string),
		passed: count,
		failing: list(check),
		pending: list(check),
	}),
	reviews: list(
		shape<Review>({
			reviewer: string,
			state: string,
			current: boolean,
			commit: nullable(string),
			submittedAt: time,
			url: string,
		}),
	),
	checkpoints: list(shape<Status["checkpoints"][number]>({ reviewer: string, round: count, url: string })),
	reviewRecord: nullable(shape<ReviewRecord>({ state: oneOf(reviewStates), head: string })),
	risk: nullable(
		shape<NonNullable<Status["risk"]>>({ tier, reason: string, classified: tier, state: oneOf(reviewStates) }),
	),
	reactions: list(shape<Reaction>({ content: string, actor: string, createdAt: time, url: string })),
	threads: list(
		shape<Thread>({
			id: string,
			path: string,
			line: nullable(count),
			outdated: boolean,
			lastAuthor: string,
			url: string,
		}),
	),
	signals: list(shape<Signal>({ kind: oneOf(["finding", "decision"]), url: string, author: string, text: string })),
	holds: list(
		shape<HoldFact>({
			label: string,
			token: nullable(string),
			takenAt: nullable(time),
			age: nullable(string),
			eventUrl: nullable(string),
		}),
	),
	starterHold: nullable(shape<StarterHold>({ lastActive: time, age: string, url: string })),
});

const openPull = shape<OpenPull>({
	number: count,
	url: string,
	branch: name,
	head: nullable(name),
	draft: boolean,
	created: count,
	updated: count,
	handedBack: boolean,
	body: string,
});

const holdings = shape<Holdings>({
	claims: list(shape<Claim>({ branch, url: nullable(string), pull: nullable(openPull) })),
	landed: mapOf(branch, sha),
});

const source = shape<ClaimSource>({ repository, tips: maybe(mapOf(branch, sha)) });

const watchPoll = shape<WatchPoll>({
	events: list(shape<WaitEvent>({ point: name, type: name, actor: name, url: name })),
	cursor: name,
	pollInterval: count,
});

const info = shape<ForgeInfo>({
	login: name,
	repositories: list((value, at) =>
		typeof value === "string" && /^[a-z\d._-]+\/[a-z\d._-]+$/.test(value)
			? value
			: fail(at, "a lowercase owner/repo"),
	),
});

const REQUESTS: { [C in ForgeCall]: Parse<ForgeCalls[C]["request"]> } = {
	status: shape({ pull: pullRequest }),
	pulls: shape({ repository }),
	held: shape({
		sources: shape<ClaimSources>({ upstream: source, fork: maybe(source) }),
		branches: list(branch),
	}),
	watch: shape({ pull: pullRequest, from: nullable(name) }),
};

const VALUES: { [C in ForgeCall]: Parse<ForgeCalls[C]["value"]> } = {
	status,
	pulls: list(openPull),
	held: holdings,
	watch: watchPoll,
};

const answer = <T>(value: Parse<T>): Parse<Answer<T>> => shape<Answer<T>>({ value, asOf: nullable(time) });
