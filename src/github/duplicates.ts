// Quests a PR adds that another open PR also adds, so a follow-up some other PR already owns is
// caught before a pick round asks about it.
import { isQuest, parse } from "../core";
import { type GitHub, type PullRequest, array, object, repositoryPath, string } from "./client";

/** A quest the PR adds that another open PR also adds, at the same path or under the same title. */
export interface Duplicate {
	/** The quest file the PR adds. */
	path: string;
	/** The other open PR. */
	url: string;
	/** The quest file the other PR adds: `path` itself, or another path with the same title. */
	other: string;
}

/** An open PR's added quest files, each with its title, or null when it has none. */
export interface Added {
	number: number;
	url: string;
	quests: { path: string; title: string | null }[];
}

const OPEN = `query OpenQuests($owner: String!, $repo: String!, $after: String) {
	repository(owner: $owner, name: $repo) {
		pullRequests(states: OPEN, first: 50, after: $after) {
			pageInfo { hasNextPage endCursor }
			nodes { number url headRefOid files(first: 100) { pageInfo { hasNextPage } nodes { path changeType } } }
		}
	}
}`;

/** Blobs read per title query. */
const BATCH = 100;

/** A file under a `quest/` directory, at the root or in a subdirectory holding a tree, that is a quest document. */
const questFile = (path: string) => /(?:^|\/)quest\/./.test(path) && isQuest(path);

/** A title compared without its size, case, or spacing, which agents vary for the same work. */
export function titleKey(title: string): string {
	return title
		.replace(/^\[[^\]]*\]\s*/, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/** Each quest `self` adds that another of `pulls` adds at the same path or with the same title. */
export function duplicates(self: number, pulls: Added[]): Duplicate[] {
	const own = pulls.find((pull) => pull.number === self);
	if (own === undefined) return [];
	const found: Duplicate[] = [];
	for (const quest of own.quests) {
		const key = quest.title === null ? null : titleKey(quest.title);
		for (const pull of pulls) {
			if (pull.number === self) continue;
			for (const other of pull.quests)
				if (
					other.path === quest.path ||
					(key !== "" && key !== null && other.title !== null && titleKey(other.title) === key)
				)
					found.push({ path: quest.path, url: pull.url, other: other.path });
		}
	}
	return found;
}

/**
 * The quests `pr` adds that another open PR in its repository also adds. Reads every open PR's added
 * files, then the titles of their quests at each PR's head, only when `pr` adds a quest.
 */
export async function duplicateQuests(github: GitHub, pr: PullRequest): Promise<Duplicate[]> {
	const pulls: { number: number; url: string; head: string; paths: string[] }[] = [];
	for (let after: string | null = null, more = true; more;) {
		const data = await github.graphql(OPEN, { owner: pr.owner, repo: pr.repo, after });
		if (data.repository === null)
			throw new Error(`cannot read ${pr.owner}/${pr.repo}; check the repository and token`);
		const list = object(object(data.repository).pullRequests);
		for (const node of array(list.nodes)) {
			const files = object(node.files);
			const number = Number(node.number);
			// GraphQL lists at most 100 files; REST lists up to 3,000, enough for any PR adding quests.
			const added =
				object(files.pageInfo).hasNextPage === true
					? (await github.all(`${repositoryPath(pr)}/pulls/${number}/files?per_page=100`))
							.filter((row) => row.status === "added")
							.map((row) => string(row.filename))
					: array(files.nodes)
							.filter((file) => file.changeType === "ADDED")
							.map((file) => string(file.path));
			pulls.push({
				number,
				url: string(node.url),
				head: string(node.headRefOid),
				paths: added.filter(questFile),
			});
		}
		const info = object(list.pageInfo);
		more = info.hasNextPage === true;
		after = more ? string(info.endCursor) : null;
	}
	const own = pulls.find((pull) => pull.number === pr.number);
	if (own === undefined || own.paths.length === 0) return [];
	const blobs = pulls.flatMap((pull) => pull.paths.map((path) => `${pull.head}:${path}`));
	const titles = new Map<string, string | null>();
	for (let start = 0; start < blobs.length; start += BATCH) {
		const batch = blobs.slice(start, start + BATCH);
		const query =
			`query($owner: String!, $repo: String!, ${batch.map((_, i) => `$e${i}: String!`).join(", ")}) { repository(owner: $owner, name: $repo) { ` +
			batch.map((_, i) => `f${i}: object(expression: $e${i}) { ... on Blob { text } }`).join(" ") +
			" } }";
		const data = await github.graphql(query, {
			owner: pr.owner,
			repo: pr.repo,
			...Object.fromEntries(batch.map((blob, i) => [`e${i}`, blob])),
		});
		const repository = object(data.repository);
		batch.forEach((blob, i) => {
			const node = repository[`f${i}`];
			const text = node === null || node === undefined ? null : object(node).text;
			const path = blob.slice(blob.indexOf(":") + 1);
			titles.set(blob, typeof text === "string" ? (parse(path, text).title?.text ?? null) : null);
		});
	}
	return duplicates(
		pr.number,
		pulls.map((pull) => ({
			number: pull.number,
			url: pull.url,
			quests: pull.paths.map((path) => ({ path, title: titles.get(`${pull.head}:${path}`) ?? null })),
		})),
	);
}
