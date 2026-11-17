// Every open PR's changed files, as GitHub lists them: what `gh pr list --json files` gives, without its cap.
import type { PullFiles, Repository } from "../core";
import { type GitHub, array, object, repositoryPath, string } from "./client";

/** An open PR with the files it changes, each with whether it adds that file. */
export interface OpenFiles {
	number: number;
	url: string;
	/** The head commit the files are at. */
	head: string;
	files: { path: string; added: boolean }[];
}

const OPEN = `query OpenFiles($owner: String!, $repo: String!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequests(states: OPEN, first: 50, after: $after) {
			pageInfo { hasNextPage endCursor }
			nodes { number url headRefOid files(first: 100) { pageInfo { hasNextPage } nodes { path changeType } } }
		}
	}
}`;

/** Every open PR in `repository` with its changed files. */
export async function openFiles(github: GitHub, repository: Repository): Promise<OpenFiles[]> {
	const pulls: OpenFiles[] = [];
	for (let after: string | null = null, more = true; more;) {
		const data = await github.graphql(OPEN, { owner: repository.owner, repo: repository.repo, after });
		if (data.repository === null)
			throw new Error(`cannot read ${repository.owner}/${repository.repo}; check the repository and token`);
		const list = object(object(data.repository).pullRequests);
		for (const node of array(list.nodes)) {
			const files = object(node.files);
			const number = Number(node.number);
			// GraphQL lists at most 100 files; REST lists up to 3,000.
			const changed =
				object(files.pageInfo).hasNextPage === true
					? (await github.all(`${repositoryPath(repository)}/pulls/${number}/files?per_page=100`)).map(
							(row) => ({
								path: string(row.filename),
								added: row.status === "added",
							}),
						)
					: array(files.nodes).map((file) => ({
							path: string(file.path),
							added: file.changeType === "ADDED",
						}));
			pulls.push({ number, url: string(node.url), head: string(node.headRefOid), files: changed });
		}
		const info = object(list.pageInfo);
		more = info.hasNextPage === true;
		after = more ? string(info.endCursor) : null;
	}
	return pulls;
}

/** `openFiles` as the paths each PR changes, by number. */
export async function openPullFiles(github: GitHub, repository: Repository): Promise<PullFiles[]> {
	const pulls = await openFiles(github, repository);
	return pulls
		.sort((a, b) => a.number - b.number)
		.map(({ number, url, files }) => ({ number, url, files: files.map((file) => file.path) }));
}
