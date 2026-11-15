// The GitHub backend of the forge reads: each read as GitHub answers it, live.
import type {
	Answer,
	ClaimSources,
	Forge,
	Holdings,
	OpenPull,
	PullRequest,
	Repository,
	Status,
	Watch,
	WatchOptions,
} from "../core";
import { held, openPullRequests } from "./claims";
import { GitHub, type GitHubDependencies, object, string } from "./client";
import { pullRequestStatus } from "./status";
import { watchPull } from "./wait";

/** Reads from GitHub with the dependencies' token. */
export class GitHubForge implements Forge {
	readonly name = "GitHub";
	#viewer: Promise<string> | undefined;

	/** `viewer` names the person reading when the token is not theirs, such as an App installation's. */
	constructor(
		private readonly deps: GitHubDependencies,
		viewer?: string,
	) {
		if (viewer !== undefined) this.#viewer = Promise.resolve(viewer);
	}

	viewer(): Promise<string> {
		this.#viewer ??= new GitHub(this.deps)
			.graphql("query { viewer { login } }", {})
			.then((data) => string(object(data.viewer).login));
		return this.#viewer;
	}

	async status(pull: PullRequest): Promise<Answer<Status>> {
		return live(await pullRequestStatus(pull, this.deps));
	}

	async pulls(repository: Repository): Promise<Answer<OpenPull[]>> {
		return live(await openPullRequests(new GitHub(this.deps), repository));
	}

	async held(sources: ClaimSources, branches: string[]): Promise<Answer<Holdings>> {
		return live(await held(new GitHub(this.deps), sources, branches));
	}

	watch(pull: PullRequest, options: WatchOptions): Watch {
		return watchPull(new GitHub(this.deps, options.deadline), this.deps, pull, options.since, this);
	}
}

const live = <T>(value: T): Answer<T> => ({ value, asOf: null });
