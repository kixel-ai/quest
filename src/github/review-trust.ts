// Whose `## Review` record `quest status` counts: only one whose section a user with write access to the base
// repository last changed, since anyone can write a SHA into their own PR's body.
import { type PullRequest, recordedRisk, reviewSection } from "../core";
import { type GitHubReader, array, object, string } from "./client";

/** Edits read per page, each carrying a whole body of up to 65,536 characters; the record's writer is usually among the newest few. */
const PAGE = 10;
/** The newest edits read for the one that last changed the section; past them, its writer is unknown. */
const EDITS = 100;

const EDITS_QUERY = `query BodyEdits($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
		body author { __typename login }
		userContentEdits(first: ${PAGE}, after: $after) {
			pageInfo { hasNextPage endCursor }
			nodes { editedAt deletedAt editor { __typename login } diff }
		}
	} }
}`;

/** Permissions that count, as GitHub's `permission` field names them, which reads maintain as write and triage as read. */
const WRITERS = ["admin", "maintain", "write"];
const PERMISSIONS = [...WRITERS, "triage", "read", "none"];

/**
 * The `## Review` section's text as its readers take it, or null without one. HTML comments, which GitHub hides,
 * and the land fixer's `mechanical fix by` lines are dropped, so a bot adding either, as CodeRabbit's summary
 * markers and `quest land` do, changes no record, and neither can carry a SHA into one.
 */
export function counted(body: string): string | null {
	const section = reviewSection(body);
	if (section === null) return null;
	return body
		.slice(section.start, section.end)
		.replace(/<!--[\s\S]*?(?:-->|$)/g, "")
		.replace(/^mechanical fix by [^:\n]+: .*$/gm, "")
		.trim();
}

/**
 * `body` reduced to the `## Review` record `quest status` counts: the section as {@link counted} reads it when a user
 * with write access to `pr`'s repository last changed that text, else nothing, with a warning saying why. A body
 * whose section names no full SHA and no risk is returned as it reads, unchecked, since it records nothing.
 */
export async function trustedReview(
	github: GitHubReader,
	pr: PullRequest,
	body: string,
	warn: (message: string) => void,
): Promise<string> {
	const text = counted(body);
	if (text === null) return "";
	const record = `## Review\n\n${text}\n`;
	if (!/\b[0-9a-f]{40}\b/.test(text) && recordedRisk(record) === null) return record;
	const why = await untrusted(github, pr, body, text);
	if (why === null) return record;
	warn(`${pr.owner}/${pr.repo}#${pr.number}'s ## Review record does not count: ${why}`);
	return "";
}

/** Why the section reading `text` is untrusted, or null when writers alone last changed it. */
async function untrusted(github: GitHubReader, pr: PullRequest, body: string, text: string): Promise<string | null> {
	// Newest first: the version that set `text` is the oldest of the newest run of versions reading `text`.
	let writer: unknown = undefined;
	let after: string | null = null;
	let read = 0;
	let newer = Infinity;
	for (;;) {
		const data = await github.graphql(EDITS_QUERY, { owner: pr.owner, repo: pr.repo, number: pr.number, after });
		const pull = object(object(data.repository).pullRequest);
		if (pull.body !== body)
			throw new Error("the PR body changed while reading its edit history; rerun quest status");
		const edits = object(pull.userContentEdits);
		const nodes = array(edits.nodes);
		for (const edit of nodes) {
			const at = Date.parse(string(edit.editedAt));
			if (!(at <= newer)) throw new Error("invalid GitHub response: the PR body's edits are not newest first");
			newer = at;
			if (typeof edit.diff !== "string") return "a revision in its edit history was deleted";
			if (read++ === 0 && edit.diff !== body)
				throw new Error("invalid GitHub response: the PR body's newest edit is not its body");
			if (counted(edit.diff) !== text) return judge(github, pr, [writer]);
			writer = edit.editor;
		}
		const info = object(edits.pageInfo);
		// The oldest edit is the PR's creation, by its author; a body never edited has none.
		if (info.hasNextPage !== true) return judge(github, pr, read === 0 ? [pull.author] : [writer, pull.author]);
		if (read >= EDITS)
			return `its newest ${EDITS} edits all leave the section as it is, so who wrote it is unknown`;
		after = string(info.endCursor);
	}
}

/** Why `actors` are not all users with write access to `pr`'s repository, or null when they are. */
async function judge(github: GitHubReader, pr: PullRequest, actors: unknown[]): Promise<string | null> {
	const seen = new Set<string>();
	for (const actor of actors) {
		if (actor === null) return "the account that last changed its section is gone";
		const { __typename: kind, login } = object(actor);
		const name = string(login);
		if (seen.has(name)) continue;
		seen.add(name);
		if (kind !== "User") return `${name}, who last changed its section, is a ${string(kind)}, not a user`;
		const response = await github.request(
			`/repos/${pr.owner}/${pr.repo}/collaborators/${encodeURIComponent(name)}/permission`,
			{ allow: [403, 404] },
		);
		if (!response.ok)
			return `cannot read the permission of ${name}, who last changed its section (HTTP ${response.status})`;
		const permission = object(await response.json()).permission;
		if (typeof permission !== "string" || !PERMISSIONS.includes(permission))
			throw new Error(`invalid GitHub response: unknown permission ${JSON.stringify(permission)}`);
		if (!WRITERS.includes(permission))
			return `${name}, who last changed its section, has ${permission} access to ${pr.owner}/${pr.repo}, not write`;
	}
	return null;
}
