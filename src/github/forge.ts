// The GitHub backend of the forge reads: each read as GitHub answers it, live.
import type {
	Answer,
	ClaimSources,
	Forge,
	Holdings,
	OpenPull,
	PullFiles,
	PullRequest,
	PullView,
	Repository,
	Status,
	Watch,
	WatchOptions,
} from "../core";
import { held, openPullRequests } from "./claims";
import { GitHub, type GitHubDependencies, object, string } from "./client";
import { openPullFiles } from "./files";
import { pullRequestStatus } from "./status";
import { pullView } from "./view";
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
		return this.#viewerOn(new GitHub(this.deps));
	}

	/** The viewer, read on `github`, whose deadline then bounds the read; kept once read, and read again after a failure. */
	#viewerOn(github: GitHub): Promise<string> {
		const read = (this.#viewer ??= github
			.graphql("query { viewer { login } }", {})
			.then((data) => string(object(data.viewer).login)));
		read.catch(() => {
			if (this.#viewer === read) this.#viewer = undefined;
		});
		return read;
	}

	async status(pull: PullRequest): Promise<Answer<Status>> {
		return live(await pullRequestStatus(pull, this.deps));
	}

	async pulls(repository: Repository): Promise<Answer<OpenPull[]>> {
		return live(await openPullRequests(new GitHub(this.deps), repository));
	}

	async files(repository: Repository): Promise<Answer<PullFiles[]>> {
		return live(await openPullFiles(new GitHub(this.deps), repository));
	}

	async held(sources: ClaimSources, branches: string[]): Promise<Answer<Holdings>> {
		return live(await held(new GitHub(this.deps), sources, branches));
	}

	watch(pull: PullRequest, options: WatchOptions): Watch {
		const github = new GitHub(this.deps, options.deadline);
		return watchPull(github, this.deps, pull, options.since, { viewer: () => this.#viewerOn(github) });
	}

	async view(pull: PullRequest): Promise<Answer<PullView>> {
		return live(await pullView(new GitHub(this.deps), pull));
	}
}

const live = <T>(value: T): Answer<T> => ({ value, asOf: null });
