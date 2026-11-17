// Which forge answers a repository's reads and takes its writes. A repository Kixel Quest hosts, named by a remote or
// PR URL on Kixel Quest, is read and written there alone. For one on GitHub, reads go to Kixel Quest's index for a
// person holding its token when it serves the repository, else GitHub, and writes go to GitHub. A Kixel Quest failure
// fails the command, naming the setting that reads GitHub instead where that would help.
import {
	type Answer,
	type ClaimSources,
	type Forge,
	type ForgeCall,
	type ForgeCalls,
	type ForgeInfo,
	type ForgeWrites,
	FORGE_WRITES,
	type Hold,
	type Holdings,
	type OpenPull,
	type Opening,
	type Pick,
	type PullRequest,
	type Repository,
	type Status,
	type Watch,
	type WatchOptions,
	forgeJson,
	InputError,
	parseForgeAnswer,
	parseForgeInfo,
	Refusal,
} from "../core";
import type { GitHubDependencies } from "../github/client";
import { GitHubForge } from "../github/forge";
import { pullRequest, readRemote, remoteRepository } from "./github";
import { checkedEndpoint, tokenFor, tokensPath } from "./send";

/** Kixel Quest's own URL. */
export const KIXEL_QUEST = "https://kixel.quest";
/** The variable naming another Kixel Quest, such as one running locally. */
export const KIXEL_QUEST_URL = "QUEST_KIXEL_URL";
/** The variable that, set to `github`, reads GitHub even where Kixel Quest serves the repository. */
export const FORGE = "QUEST_FORGE";

/** What choosing a forge needs from its host. */
export interface ForgeDependencies {
	env: NodeJS.ProcessEnv;
	fetch: typeof fetch;
	now(): number;
	/** Called only once a read goes to GitHub, so Kixel Quest's reads need no GitHub token. */
	github(): GitHubDependencies;
}

/** The Kixel Quest `env` names, without a trailing slash. */
export function kixelUrl(env: NodeJS.ProcessEnv): string {
	return checkedEndpoint(env[KIXEL_QUEST_URL] || KIXEL_QUEST, KIXEL_QUEST_URL).replace(/\/+$/, "");
}

/** The Kixel Quest `env` names, with the person's token for it; null without a token, or when reads are on GitHub. */
export function kixelQuest(deps: ForgeDependencies): KixelQuest | null {
	const forced = deps.env[FORGE];
	if (forced !== undefined && forced !== "" && forced !== "github")
		throw new Error(`${FORGE} is ${forced}; set it to github to read GitHub, or leave it unset`);
	if (forced === "github") return null;
	const url = kixelUrl(deps.env);
	const token = tokenFor(url, deps.env);
	return token === null ? null : new KixelQuest(url, token, deps, false);
}

/** Kixel Quest's backend for `repository`, which it hosts, failing without the person's token for it. */
export function hostedForge(repository: Repository, deps: ForgeDependencies): KixelQuestForge {
	const name = `${repository.owner}/${repository.repo}`;
	if (deps.env[FORGE] === "github") throw new Error(`Kixel Quest hosts ${name}, so ${FORGE}=github cannot reach it`);
	const url = kixelUrl(deps.env);
	const token = tokenFor(url, deps.env);
	if (token === null)
		throw new Error(`Kixel Quest (${url}) hosts ${name}; pair a token with it in ${tokensPath(deps.env)}`);
	return new KixelQuestForge(new KixelQuest(url, token, deps, true));
}

/**
 * The forge whose answers `repository`'s reads use: Kixel Quest when it hosts the repository, or serves it to this
 * person. Asking Kixel Quest gives up at `deadline`, epoch milliseconds.
 */
export async function forgeFor(
	repository: Repository,
	deps: ForgeDependencies,
	deadline = Infinity,
	hosted = false,
): Promise<Forge> {
	if (hosted) return hostedForge(repository, deps);
	const kixel = kixelQuest(deps);
	return kixel !== null && (await kixel.serves(repository, deadline))
		? new KixelQuestForge(kixel)
		: new GitHubForge(deps.github());
}

/** A PR named on the command line, and whether Kixel Quest hosts its repository rather than GitHub. */
export interface Located {
	pull: PullRequest;
	hosted: boolean;
}

/**
 * The PR `value` names: a GitHub PR URL, a Kixel Quest one (`<url>/<owner>/<repo>/pull/<number>`), or a number in
 * the repository the origin remote at `root` names on either.
 */
export function locate(value: string, root: string, env: NodeJS.ProcessEnv): Located {
	const base = kixelUrl(env);
	if (/^[1-9]\d*$/.test(value)) {
		let origin = null;
		try {
			origin = readRemote(root, "origin");
		} catch {
			// Not a checkout: pullRequest says so.
		}
		const hosted = origin === null ? null : hostedRepository(base, origin.configured.fetch, origin.used().fetch);
		if (hosted !== null && remoteRepository(origin!).repository === null)
			return { pull: { ...hosted, number: Number(value) }, hosted: true };
	} else if (value.startsWith(`${base}/`)) {
		const match = /^([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?(?:[?#].*)?$/.exec(value.slice(base.length + 1));
		if (!match) throw new InputError(`expected a Kixel Quest PR URL, ${base}/<owner>/<repo>/pull/<number>`);
		return { pull: { owner: match[1]!, repo: match[2]!, number: Number(match[3]) }, hosted: true };
	}
	return { pull: pullRequest(value, root), hosted: false };
}

/** The repository the first of `urls` on Kixel Quest at `base` names, as `<base>/<owner>/<repo>[.git]`, or null. */
export function hostedRepository(base: string, ...urls: string[]): Repository | null {
	const at = new URL(base);
	const prefix = at.pathname.replace(/\/+$/, "");
	for (const value of urls) {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			continue;
		}
		// Credentials in the URL, as a helper may leave, name the same repository.
		if (url.protocol !== at.protocol || url.host !== at.host || !url.pathname.startsWith(`${prefix}/`)) continue;
		const match = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.pathname.slice(prefix.length + 1));
		if (match) return { owner: match[1]!, repo: match[2]! };
	}
	return null;
}

/** Kixel Quest's forge API, with a person's token. */
export class KixelQuest {
	#info: Promise<ForgeInfo> | undefined;

	/** `hosted` when it hosts the repository, so reading GitHub instead would not help. */
	constructor(
		readonly url: string,
		private readonly token: string,
		private readonly deps: ForgeDependencies,
		private readonly hosted: boolean,
	) {}

	/** The person the token names, and the repositories Kixel Quest serves them, by `deadline`; kept once read. */
	info(deadline = Infinity): Promise<ForgeInfo> {
		const read = (this.#info ??= this.#send("GET", "/forge", undefined, deadline).then((json) => {
			try {
				return parseForgeInfo(json);
			} catch (error) {
				throw this.#failed("GET", "/forge", (error as Error).message);
			}
		}));
		// A failure, such as a deadline passing, is asked again next time.
		read.catch(() => {
			if (this.#info === read) this.#info = undefined;
		});
		return read;
	}

	/** Whether Kixel Quest answers `repository`'s reads for this person. */
	async serves(repository: Repository, deadline = Infinity): Promise<boolean> {
		return (await this.info(deadline)).repositories.includes(
			`${repository.owner}/${repository.repo}`.toLowerCase(),
		);
	}

	/** The time now, epoch milliseconds. */
	now(): number {
		return this.deps.now();
	}

	/** Ask for `call`, giving up at `deadline` (epoch milliseconds). */
	async call<C extends ForgeCall>(
		call: C,
		request: ForgeCalls[C]["request"],
		deadline = Infinity,
	): Promise<Answer<ForgeCalls[C]["value"]>> {
		const path = `/forge/${call}`;
		const json = await this.#send("POST", path, request, deadline);
		try {
			return parseForgeAnswer(call, json);
		} catch (error) {
			throw this.#failed("POST", path, (error as Error).message);
		}
	}

	/** A failed request, naming the setting that reads GitHub instead where Kixel Quest does not host the repository. */
	#failed(method: string, path: string, why: string): Error {
		const instead = this.hosted ? "" : `; set ${FORGE}=github to read GitHub`;
		return new Error(`Kixel Quest (${this.url}) failed ${method} ${path}: ${why}${instead}`);
	}

	/** The JSON answer to a request, or an error naming the setting that reads GitHub instead. */
	async #send(method: "GET" | "POST", path: string, body: unknown, deadline: number): Promise<unknown> {
		const failed = (why: string) => this.#failed(method, path, why);
		const remaining = deadline - this.deps.now();
		if (remaining <= 0) throw failed("its deadline passed");
		// Called unbound, as a Worker's fetch requires.
		const fetch = this.deps.fetch;
		let response: Response;
		let text: string;
		try {
			response = await fetch(`${this.url}${path}`, {
				method,
				// The token is Kixel Quest's alone, so it follows no redirect elsewhere.
				redirect: "error",
				headers: {
					Authorization: `Bearer ${this.token}`,
					Accept: "application/json",
					"User-Agent": "quest",
					...(body === undefined ? {} : { "Content-Type": "application/json" }),
				},
				...(body === undefined ? {} : { body: forgeJson(body) }),
				...(Number.isFinite(remaining)
					? { signal: AbortSignal.timeout(Math.max(0, Math.ceil(remaining))) }
					: {}),
			});
			text = await response.text();
		} catch (error) {
			throw failed(error instanceof Error ? error.message : String(error));
		}
		if (response.status === 401 || response.status === 403)
			throw failed(`it refused the token ${tokensPath(this.deps.env)} pairs with it (HTTP ${response.status})`);
		// A malformed wait point, token, thread, or body is the caller's to fix on any forge; the other reads take no
		// free-form argument, so their 400 means the CLI and Kixel Quest disagree on the wire, which reading GitHub
		// sidesteps.
		const write = (FORGE_WRITES as readonly string[]).includes(path.slice("/forge/".length));
		if (response.status === 400 && (path === "/forge/watch" || write))
			throw new InputError(`Kixel Quest refused ${method} ${path}${reason(text) || ", a bad request"}`);
		// A write the forge declines as things stand, such as a PR another session holds, is a refusal to report.
		if (response.status === 409 && write)
			throw new Refusal(reason(text).slice(2) || `Kixel Quest refused ${method} ${path}`);
		if (!response.ok) throw failed(`HTTP ${response.status}${reason(text)}`);
		try {
			return JSON.parse(text);
		} catch {
			throw failed("its answer is not JSON");
		}
	}
}

/** The reason in an error body, `{"error": "..."}`, if it gives one. */
function reason(text: string): string {
	try {
		const error = (JSON.parse(text) as { error?: unknown } | null)?.error;
		return typeof error === "string" && error !== "" ? `, ${error}` : "";
	} catch {
		return "";
	}
}

/** Reads from Kixel Quest's index, and writes to a repository it hosts. */
export class KixelQuestForge implements Forge, ForgeWrites {
	readonly name = "Kixel Quest";

	constructor(private readonly kixel: KixelQuest) {}

	async viewer(): Promise<string> {
		return (await this.kixel.info()).login;
	}

	status(pull: PullRequest): Promise<Answer<Status>> {
		return this.kixel.call("status", { pull });
	}

	pulls(repository: Repository): Promise<Answer<OpenPull[]>> {
		return this.kixel.call("pulls", { repository });
	}

	held(sources: ClaimSources, branches: string[]): Promise<Answer<Holdings>> {
		return this.kixel.call("held", { sources, branches });
	}

	watch(pull: PullRequest, { since, deadline, started: began }: WatchOptions): Watch {
		const kixel = this.kixel;
		let cursor: string | undefined;
		// Until Kixel Quest first answers, a timeout resumes from when the wait began, so a retry still reports a push
		// made meanwhile; GitHub's backend resumes from the head, which needs a read that could time out too. GitHub
		// times activity to the second, so the point rounds down to keep activity in the wait's first second.
		const started = since ?? new Date(Math.floor((began ?? kixel.now()) / 1000) * 1000).toISOString();
		return {
			get resume() {
				return cursor ?? started;
			},
			async poll() {
				const answer = await kixel.call("watch", { pull, from: cursor ?? since ?? null }, deadline);
				cursor = answer.value.cursor;
				return answer;
			},
		};
	}

	async open(opening: Opening): Promise<OpenPull> {
		return (await this.kixel.call("open", { opening })).value;
	}

	async close(pull: PullRequest): Promise<void> {
		await this.kixel.call("close", { pull });
	}

	async edit(pull: PullRequest, { title, body }: { title: string | null; body: string | null }): Promise<void> {
		await this.kixel.call("edit", { pull, title, body });
	}

	async comment(pull: PullRequest, { body, thread }: { body: string; thread: string | null }): Promise<string> {
		return (await this.kixel.call("comment", { pull, body, thread })).value.url;
	}

	async resolve(pull: PullRequest, thread: string): Promise<void> {
		await this.kixel.call("resolve", { pull, thread });
	}

	async hold(pull: PullRequest, token: string | null): Promise<Hold> {
		return (await this.kixel.call("hold", { pull, token })).value;
	}

	async ready(pull: PullRequest, token: string | null): Promise<Hold | null> {
		return (await this.kixel.call("ready", { pull, token })).value;
	}

	async release(pull: PullRequest, token: string): Promise<Hold> {
		return (await this.kixel.call("release", { pull, token })).value;
	}

	/** Kixel Quest's queue fast-forwards the base, so it takes no merge method, and it lands nothing at once. */
	async pick(pull: PullRequest, { head, method, direct }: Pick): Promise<void> {
		if (method !== null || direct)
			throw new InputError(
				`Kixel Quest lands by fast-forwarding the base through its queue, so it takes no --${method ?? "direct"}`,
			);
		await this.kixel.call("pick", { pull, head });
	}
}
