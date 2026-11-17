// Which forge answers a repository's reads: Kixel Quest's index, for a person holding its token and a repository it
// serves, else GitHub. A Kixel Quest failure fails the command, naming the setting that reads GitHub instead.
import {
	type Answer,
	type ClaimSources,
	type Forge,
	type ForgeCall,
	type ForgeCalls,
	type ForgeInfo,
	type Holdings,
	type OpenPull,
	type PullRequest,
	type Repository,
	type Status,
	type Watch,
	type WatchOptions,
	forgeJson,
	InputError,
	parseForgeAnswer,
	parseForgeInfo,
} from "../core";
import type { GitHubDependencies } from "../github/client";
import { GitHubForge } from "../github/forge";
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

/** The Kixel Quest `env` names, with the person's token for it; null without a token, or when reads are on GitHub. */
export function kixelQuest(deps: ForgeDependencies): KixelQuest | null {
	const forced = deps.env[FORGE];
	if (forced !== undefined && forced !== "" && forced !== "github")
		throw new Error(`${FORGE} is ${forced}; set it to github to read GitHub, or leave it unset`);
	if (forced === "github") return null;
	const url = checkedEndpoint(deps.env[KIXEL_QUEST_URL] || KIXEL_QUEST, KIXEL_QUEST_URL).replace(/\/+$/, "");
	const token = tokenFor(url, deps.env);
	return token === null ? null : new KixelQuest(url, token, deps);
}

/**
 * The forge whose answers `repository`'s reads use: Kixel Quest when it serves the repository to this person. Asking
 * Kixel Quest gives up at `deadline`, epoch milliseconds.
 */
export async function forgeFor(repository: Repository, deps: ForgeDependencies, deadline = Infinity): Promise<Forge> {
	const kixel = kixelQuest(deps);
	return kixel !== null && (await kixel.serves(repository, deadline))
		? new KixelQuestForge(kixel)
		: new GitHubForge(deps.github());
}

/** Kixel Quest's read API, with a person's token. */
export class KixelQuest {
	#info: Promise<ForgeInfo> | undefined;

	constructor(
		readonly url: string,
		private readonly token: string,
		private readonly deps: ForgeDependencies,
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

	/** A failed request, naming the setting that reads GitHub instead. */
	#failed(method: string, path: string, why: string): Error {
		return new Error(
			`Kixel Quest (${this.url}) failed ${method} ${path}: ${why}; set ${FORGE}=github to read GitHub`,
		);
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
		// A malformed wait point is the caller's to fix on any forge; the other reads take no free-form argument, so
		// their 400 means the CLI and Kixel Quest disagree on the wire, which reading GitHub sidesteps.
		if (response.status === 400 && path === "/forge/watch")
			throw new InputError(`Kixel Quest refused ${method} ${path}${reason(text) || ", a bad request"}`);
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

/** Reads from Kixel Quest's index. */
export class KixelQuestForge implements Forge {
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
}
